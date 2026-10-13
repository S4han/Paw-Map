"""명령줄 도구.

  pawmap-ingest validate <데이터셋 폴더>   manifest·시도 파일의 스키마와 판정 규칙 검증
  pawmap-ingest schema [출력 파일]         데이터셋 JSON 스키마 내보내기
"""

from __future__ import annotations

import argparse
import json
import sys
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pawmap-ingest")
    sub = parser.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("validate")
    v.add_argument("folder", type=Path)
    s = sub.add_parser("schema")
    s.add_argument("out", type=Path, nargs="?")
    args = parser.parse_args(argv)

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
