"""명령줄 도구.

  pawmap-ingest build --region 50 --out <데이터셋 폴더> [--mfds 식약처.xlsx --mfds-date YYYY-MM-DD]
                                         관광공사·식약처 → 시도 파일 생성 + 검증 + 보고서
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
        min_lat, min_lng, max_lat, max_lng = region.bbox
        for p in data.places:
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
    from .build import BuildInputs, build_region, write_outputs
    from .geocode import Geocoder, make_kakao_lookup
    from .sources import mfds as mfds_source
    from .sources.kto import KtoSource, http_fetcher

    now = datetime.now(timezone(timedelta(hours=9)))
    cache = Path(args.cache_dir)
    inp = BuildInputs(region_code=args.region, version=now.strftime("%Y%m%d"), fetched_at=now.isoformat(timespec="seconds"))
    if not args.skip_kto:
        inp.kto = KtoSource(http_fetcher(_env_key("DATA_GO_KR_SERVICE_KEY")), cache / "kto_detail", max_calls=args.max_calls)
    if args.mfds:
        if not args.mfds_date:
            raise SystemExit("[중단] --mfds-date(식약처 파일을 받은 날, YYYY-MM-DD)가 필요합니다")
        inp.mfds_rows = mfds_source.parse_rows(mfds_source.read_xlsx(Path(args.mfds)))
        inp.mfds_fetched_at = args.mfds_date
        inp.geocoder = Geocoder(make_kakao_lookup(_env_key("KAKAO_REST_API_KEY")), cache / "geocode.json")

    try:
        places, report, sources = build_region(inp)
    finally:
        if inp.geocoder:
            inp.geocoder.save()
    out = Path(args.out)
    write_outputs(out, inp, places, sources)
    errors = validate(out)
    report.add()
    report.add("## 검증")
    report.add("- 통과" if not errors else f"- 오류 {len(errors)}건")
    report.lines += [f"  - {e}" for e in errors]
    report_path = Path(args.report_dir) / f"ingest-{inp.version}-{args.region}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report.markdown(), encoding="utf-8")
    print(report.markdown())
    print(f"보고서: {report_path}")
    return 1 if errors else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pawmap-ingest")
    sub = parser.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--region", required=True, help="법정동 시도 코드(제주 50)")
    b.add_argument("--out", required=True, help="데이터셋 폴더(예: ../frontend/public/data/live)")
    b.add_argument("--mfds", help="식약처 반려동물 동반 가능 업소 현황 xlsx")
    b.add_argument("--mfds-date", help="식약처 파일을 받은 날 YYYY-MM-DD")
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
