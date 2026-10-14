"""시도 파일 데이터셋 → 격자 칸 파일 데이터셋(배포용).

시도 단위로 가공·저장한 결과(작업 폴더)를 0.1도 격자(약 11×9km)로 다시 나눈다. 브라우저는 반경에 걸치는 칸만 받는다.
- 동반 장소: t/{key}.json, 반려 생활: t/{key}.s.json (그 칸에 있을 때만)
- 칸 키: "{floor(위도×10)}_{floor(경도×10)}" — 프론트 domain/tiles.ts 와 같은 규칙
- manifest 에는 시도 이름·건수·범위(파일 없음)와 칸 목록을 둔다
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

from .models import DatasetManifest, ManifestRegion, ManifestTile, PetPlace, RegionFile, TileFile
from .rules import check_place

TILE_DEG = 0.1
TILE_DIR = "t"


def _factor(deg: float) -> int:
    f = round(1 / deg)
    if not math.isclose(f * deg, 1.0):
        raise ValueError(f"칸 크기는 1/정수여야 합니다: {deg}")
    return f


def tile_key(lat: float, lng: float, deg: float = TILE_DEG) -> str:
    f = _factor(deg)
    # 1e-9: 0.3 × 10 = 2.9999… 같은 부동소수 오차로 칸이 어긋나지 않게
    return f"{math.floor(lat * f + 1e-9)}_{math.floor(lng * f + 1e-9)}"


def tile_bounds(key: str, deg: float = TILE_DEG) -> tuple[float, float, float, float]:
    f = _factor(deg)
    i, j = (int(x) for x in key.split("_"))
    return (i / f, j / f, (i + 1) / f, (j + 1) / f)


def _load_regions(src: Path) -> tuple[DatasetManifest, list[PetPlace], list[PetPlace]]:
    manifest = DatasetManifest.model_validate_json((src / "manifest.json").read_text(encoding="utf-8"))
    if manifest.tiles is not None:
        raise ValueError(f"{src} 는 이미 격자 방식입니다(시도 파일 방식 폴더가 필요)")
    places: list[PetPlace] = []
    services: list[PetPlace] = []
    for r in manifest.regions:
        if not r.file:
            raise ValueError(f"{src}/manifest.json: 시도 {r.code} 에 파일이 없습니다")
        places += RegionFile.model_validate_json((src / r.file).read_text(encoding="utf-8")).places
        if r.services_file:
            services += RegionFile.model_validate_json((src / r.services_file).read_text(encoding="utf-8")).places
    return manifest, places, services


def tile_dataset(src: Path, out: Path, deg: float = TILE_DEG) -> DatasetManifest:
    """src(시도 파일 방식) → out(격자 방식). out/t 의 예전 칸 파일은 지운다(없어진 칸이 남지 않게)."""
    manifest, places, services = _load_regions(src)
    groups: dict[str, dict[str, list[PetPlace]]] = defaultdict(lambda: {"p": [], "s": []})
    for p in places:
        groups[tile_key(p.latitude, p.longitude, deg)]["p"].append(p)
    for p in services:
        groups[tile_key(p.latitude, p.longitude, deg)]["s"].append(p)

    tdir = out / TILE_DIR
    tdir.mkdir(parents=True, exist_ok=True)
    for old in tdir.glob("*.json"):
        old.unlink()
    tiles: list[ManifestTile] = []
    for key in sorted(groups):
        g = groups[key]
        for kind, items in (("json", g["p"]), ("s.json", g["s"])):
            if items:
                data = TileFile(tile=key, version=manifest.version, places=sorted(items, key=lambda x: x.id))
                (tdir / f"{key}.{kind}").write_text(data.model_dump_json(by_alias=True, exclude_none=True), encoding="utf-8")
        tiles.append(ManifestTile(key=key, count=len(g["p"]), services_count=len(g["s"])))

    regions = [ManifestRegion(code=r.code, name=r.name, count=r.count, bbox=r.bbox, services_count=r.services_count) for r in manifest.regions]
    tiled = manifest.model_copy(update={"regions": regions, "tile_deg": deg, "tiles": tiles})
    (out / "manifest.json").write_text(json.dumps(tiled.model_dump(by_alias=True, exclude_none=True), ensure_ascii=False, indent=1), encoding="utf-8")
    # 예전 시도 파일이 out 에 남아 있으면 배포에 섞이므로 지운다(작업 폴더와 out 이 다를 때만)
    if src.resolve() != out.resolve():
        for old in list(out.glob("places.*.json")) + list(out.glob("services.*.json")):
            old.unlink()
    return tiled


def validate_tiles(folder: Path, manifest: DatasetManifest) -> list[str]:
    errors: list[str] = []
    deg = manifest.tile_deg or TILE_DEG
    seen: set[str] = set()
    total = 0
    for t in manifest.tiles or []:
        for kind, expected, want_service in (("json", t.count, False), ("s.json", t.services_count, True)):
            path = folder / TILE_DIR / f"{t.key}.{kind}"
            if expected == 0:
                if path.exists():
                    errors.append(f"{path.name}: manifest 건수 0 인데 파일이 있음")
                continue
            if not path.exists():
                errors.append(f"{path.name}: 파일 없음")
                continue
            data = TileFile.model_validate_json(path.read_text(encoding="utf-8"))
            if data.tile != t.key or len(data.places) != expected:
                errors.append(f"{path.name}: 칸 키·건수가 manifest 와 다름")
            min_lat, min_lng, max_lat, max_lng = tile_bounds(t.key, deg)
            for p in data.places:
                if (p.category == "PET_SERVICE") != want_service:
                    errors.append(f"{path.name} {p.id}: 반려 생활은 .s.json 에만 둔다")
                if p.id in seen:
                    errors.append(f"{path.name} {p.id}: 중복 id")
                seen.add(p.id)
                if tile_key(p.latitude, p.longitude, deg) != t.key:
                    errors.append(f"{path.name} {p.id}: 좌표가 칸 밖 ({min_lat},{min_lng})~({max_lat},{max_lng})")
                errors += [f"{path.name} {p.id}: {msg}" for msg in check_place(p)]
            total += len(data.places)
    expected_total = sum(r.count + (r.services_count or 0) for r in manifest.regions)
    if total != expected_total:
        errors.append(f"칸 파일 합계 {total} != 시도 합계 {expected_total}")
    return errors
