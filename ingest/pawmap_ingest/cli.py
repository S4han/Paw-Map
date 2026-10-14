"""명령줄 도구.

  pawmap-ingest build --region 50|11,26|all --out <데이터셋 폴더> [--mfds 식약처.xlsx --mfds-date YYYY-MM-DD]
                                         [--kcisa 한국문화정보원.csv --kcisa-date YYYY-MM-DD]
                                         관광공사·식약처·한국문화정보원 → 시도 파일 생성 + 검증 + 보고서
  pawmap-ingest validate <데이터셋 폴더>   manifest·시도 파일의 스키마와 판정 규칙 검증
  pawmap-ingest schema [출력 파일]         데이터셋 JSON 스키마 내보내기

키는 환경변수로만: DATA_GO_KR_SERVICE_KEY(관광공사), KAKAO_REST_API_KEY(식약처 주소→좌표)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .models import DatasetManifest, RegionFile
from .rules import check_place


def validate(folder: Path) -> list[str]:
    errors: list[str] = []
    manifest = DatasetManifest.model_validate_json((folder / "manifest.json").read_text(encoding="utf-8"))
    for region in manifest.regions:
        data = RegionFile.model_validate_json((folder / region.file).read_text(encoding="utf-8"))
        if data.region_code != region.code:
            errors.append(f"{region.file}: regionCode {data.region_code} != manifest {region.code}")
        if len(data.places) != region.count:
            errors.append(f"{region.file}: 건수 {len(data.places)} != manifest {region.count}")
        ids = [p.id for p in data.places]
        if len(ids) != len(set(ids)):
            errors.append(f"{region.file}: 중복 id")
        places = list(data.places)
        if region.services_file:
            services = RegionFile.model_validate_json((folder / region.services_file).read_text(encoding="utf-8"))
            if services.region_code != region.code or len(services.places) != region.services_count:
                errors.append(f"{region.services_file}: 지역 코드·건수가 manifest 와 다름")
            if any(p.category != "PET_SERVICE" for p in services.places):
                errors.append(f"{region.services_file}: 반려 생활이 아닌 장소가 섞임")
            if any(p.category == "PET_SERVICE" for p in data.places):
                errors.append(f"{region.file}: 반려 생활 시설은 {region.services_file} 에만 둔다")
            places += services.places
        min_lat, min_lng, max_lat, max_lng = region.bbox
        for p in places:
            errors += [f"{region.file} {p.id}: {msg}" for msg in check_place(p)]
            if not (min_lat <= p.latitude <= max_lat and min_lng <= p.longitude <= max_lng):
                errors.append(f"{region.file} {p.id}: 좌표가 지역 경계 상자 밖")
    return errors


def _env_key(name: str) -> str:
    value = os.environ.get(name, "").strip().strip("'\"").strip()
    if not value:
        raise SystemExit(f"[중단] 환경변수 {name} 가 비어 있습니다")
    return value


def run_build(args: argparse.Namespace) -> int:
    from dataclasses import replace

    from .build import BuildInputs, build_region, write_outputs
    from .geocode import Geocoder, make_kakao_lookup
    from .regions import parse_region_arg, sido
    from .sources import kcisa as kcisa_source
    from .sources import mfds as mfds_source
    from .sources.kto import BudgetExceeded, KtoSource, http_fetcher

    try:
        codes = parse_region_arg(args.region)
    except ValueError as e:
        raise SystemExit(f"[중단] {e}") from None
    now = datetime.now(timezone(timedelta(hours=9)))
    cache = Path(args.cache_dir)
    base = BuildInputs(region_code=codes[0], version=now.strftime("%Y%m%d"), fetched_at=now.isoformat(timespec="seconds"))
    if not args.skip_kto:
        base.kto = KtoSource(http_fetcher(_env_key("DATA_GO_KR_SERVICE_KEY")), cache / "kto_detail", max_calls=args.max_calls)
    if args.mfds:
        if not args.mfds_date:
            raise SystemExit("[중단] --mfds-date(식약처 파일을 받은 날, YYYY-MM-DD)가 필요합니다")
        base.mfds_rows = mfds_source.parse_rows(mfds_source.read_xlsx(Path(args.mfds)))
        base.mfds_fetched_at = args.mfds_date
        base.geocoder = Geocoder(make_kakao_lookup(_env_key("KAKAO_REST_API_KEY")), cache / "geocode.json")
    if args.kcisa:
        if not args.kcisa_date:
            raise SystemExit("[중단] --kcisa-date(한국문화정보원 파일을 받은 날, YYYY-MM-DD)가 필요합니다")
        base.kcisa_rows = kcisa_source.read_csv(Path(args.kcisa))
        base.kcisa_fetched_at = args.kcisa_date

    # 시도 하나씩 가공·저장한다. 관광공사 호출 상한에 걸리면 그 시도부터 멈추고, 끝난 시도는 그대로 둔다
    # (다음 날 같은 명령을 다시 실행하면 상세는 캐시를 재사용하므로 금방 따라잡는다).
    out = Path(args.out)
    done: list[str] = []
    summary: list[str] = []
    for code in codes:
        inp = replace(base, region_code=code)
        try:
            result = build_region(inp)
        except BudgetExceeded as e:
            rest = [c for c in codes if c not in done]
            print("\n".join(["# 가공 요약(중간에 멈춤)", *summary]))
            print(f"\n[멈춤] {code} {sido(code).name}: {e}")
            print(f"남은 시도만 다시: --region {','.join(rest)} (같은 --out 폴더에 이어서 저장, 끝난 시도는 그대로)")
            return 2
        finally:
            if base.geocoder:
                base.geocoder.save()
        write_outputs(out, inp, result)
        report_path = Path(args.report_dir) / f"ingest-{inp.version}-{code}.md"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(result.report.markdown(), encoding="utf-8")
        if len(codes) == 1:
            print(result.report.markdown())
        counts = result.report.counts
        summary.append(f"- {code} {sido(code).name}: 동반 장소 {counts.get('total', 0)}곳, 반려 생활 {len(result.services)}곳 → {report_path}")
        done.append(code)

    errors = validate(out)
    print("\n".join(["# 가공 요약", *summary, "", "## 검증", "- 통과" if not errors else f"- 오류 {len(errors)}건", *[f"  - {e}" for e in errors]]))
    return 1 if errors else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pawmap-ingest")
    sub = parser.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--region", required=True, help="법정동 시도 코드(제주 50), 쉼표로 여러 개, 또는 all(17개 시도)")
    b.add_argument("--out", required=True, help="데이터셋 폴더(예: ../frontend/public/data/live)")
    b.add_argument("--mfds", help="식약처 반려동물 동반 가능 업소 현황 xlsx")
    b.add_argument("--mfds-date", help="식약처 파일을 받은 날 YYYY-MM-DD")
    b.add_argument("--kcisa", help="한국문화정보원 반려동물 동반 가능 문화시설 위치 데이터 csv")
    b.add_argument("--kcisa-date", help="한국문화정보원 파일을 받은 날 YYYY-MM-DD")
    b.add_argument("--skip-kto", action="store_true")
    b.add_argument("--max-calls", type=int, default=800, help="관광공사 실행당 호출 상한")
    b.add_argument("--cache-dir", default="cache")
    b.add_argument("--report-dir", default="../reports")
    v = sub.add_parser("validate")
    v.add_argument("folder", type=Path)
    s = sub.add_parser("schema")
    s.add_argument("out", type=Path, nargs="?")
    args = parser.parse_args(argv)

    if args.cmd == "build":
        return run_build(args)

    if args.cmd == "validate":
        errors = validate(args.folder)
        for e in errors:
            print(f"✗ {e}")
        print("검증 통과" if not errors else f"오류 {len(errors)}건")
        return 1 if errors else 0

    schema = json.dumps(RegionFile.model_json_schema(by_alias=True), ensure_ascii=False, indent=2)
    if args.out:
        args.out.write_text(schema + "\n", encoding="utf-8")
    else:
        print(schema)
    return 0


if __name__ == "__main__":
    sys.exit(main())
