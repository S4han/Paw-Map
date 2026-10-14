"""행정안전부 지방행정 인허가 데이터(옛 LOCALDATA) 어댑터 — 동물병원·동물약국.

실측(api-analysis 부록, 2026-10-14 ✅ 동물병원): 요청 https://apis.data.go.kr/1741000/animal_hospitals/info,
JSON 응답 response.body.items.item, 전체 10,649건(폐업 포함), 일일 10,000회, 매일 갱신(2일 전 기준).
동물약국(animal_pharmacies/info)은 같은 체계(상세기능 화면 ✅)이며 항목은 실측으로 확인한다.
- 영업 중(SALS_STTS_CD "01" = 영업/정상)만 쓴다. 폐업·휴업 등은 건수만 보고서에 남긴다.
- 좌표 CRD_INFO_X·Y 는 EPSG:5174 → WGS84 변환(카카오 주소 검색과 중앙값 3.2m). 좌표 없는 곳(실측 7%)은
  지오코더가 있으면 도로명주소로 찾고, 없으면 뺀다.
- 동반 가능 여부는 이 출처에 없다 → petStatus 는 UNKNOWN 근거(동반 장소가 아닌 반려 생활 시설).
- LAST_MDFCN_PNT(출처가 준 최종 수정 시점)의 날짜 → checkedAt. 우리가 받은 날 → fetchedAt(섞지 않음).
"""

from __future__ import annotations

import json
import urllib.parse
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..epsg5174 import to_wgs84
from ..geocode import Geocoder
from ..models import Evidence, PetConditions, PetPlace
from ..normalize import clean_address, norm_phone
from ..regions import address_sido
from ..rules import decide_pet_status, last_verified_at

OPEN = "01"  # 영업/정상


@dataclass(frozen=True)
class Kind:
    key: str  # 명령줄·캐시 파일 이름
    source: str  # SourceId
    endpoint: str
    subcategory: str  # 한국문화정보원 반려 생활 분류와 같은 이름(세부 종류 칩)
    id_prefix: str
    dataset: str  # 공공데이터포털 번호(출처 표시)


VET = Kind("vet", "MOIS_VET", "https://apis.data.go.kr/1741000/animal_hospitals/info", "동물병원", "mois", "15154952")
PHARMACY = Kind("pharmacy", "MOIS_PHARMACY", "https://apis.data.go.kr/1741000/animal_pharmacies/info", "동물약국", "moisph", "")
KINDS = {k.key: k for k in (VET, PHARMACY)}

Fetch = Callable[[int, int], dict[str, Any]]  # (pageNo, numOfRows) → 응답 JSON


def http_fetcher(service_key: str, kind: Kind = VET) -> Fetch:
    from ..http import get_json

    key = service_key if "%" in service_key else urllib.parse.quote(service_key, safe="")

    def fetch(page: int, rows: int) -> dict[str, Any]:
        q = urllib.parse.urlencode({"pageNo": page, "numOfRows": rows, "type": "json"})
        return get_json(f"{kind.endpoint}?serviceKey={key}&{q}", secret=service_key)

    return fetch


def _body(resp: dict[str, Any]) -> dict[str, Any]:
    r = resp.get("response") or {}
    code = str((r.get("header") or {}).get("resultCode", ""))
    if code not in ("0", "00", ""):
        raise RuntimeError(f"행정안전부 인허가 API 오류: {code} {(r.get('header') or {}).get('resultMsg', '')}")
    return r.get("body") or {}


def _items(body: dict[str, Any]) -> list[dict[str, Any]]:
    items = (body.get("items") or {}).get("item") or []
    return [items] if isinstance(items, dict) else list(items)


def fetch_all(fetch: Fetch, rows_per_page: int = 100, max_pages: int = 500) -> tuple[list[dict[str, Any]], int]:
    """전국 전체를 받는다. (항목, 호출 수). 응답의 totalCount 와 받은 건수가 다르면 멈춘다."""
    body = _body(fetch(1, rows_per_page))
    total = int(body.get("totalCount") or 0)
    items = _items(body)
    calls = 1
    page = 1
    while len(items) < total:
        page += 1
        if page > max_pages:
            raise RuntimeError(f"페이지 상한({max_pages}) 초과 — totalCount {total}")
        batch = _items(_body(fetch(page, rows_per_page)))
        calls += 1
        if not batch:
            break
        items += batch
    if len(items) != total:
        raise RuntimeError(f"받은 건수 {len(items)} != totalCount {total} — 도중에 자료가 바뀌었을 수 있으니 다시 실행")
    return items, calls


def load_or_fetch(fetch: Fetch, cache_path: Path, today: str) -> tuple[list[dict[str, Any]], str, int]:
    """같은 날 받은 캐시가 있으면 재사용(여러 번 나눠 가공할 때 호출 절약). (항목, 받은 날, 호출 수)."""
    if cache_path.exists():
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        if cached.get("fetchedAt") == today:
            return cached["items"], today, 0
    items, calls = fetch_all(fetch)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps({"fetchedAt": today, "items": items}, ensure_ascii=False), encoding="utf-8")
    return items, today, calls


@dataclass
class MoisStats:
    rows: int = 0
    in_region: int = 0
    by_status: Counter[str] = field(default_factory=Counter)
    used: int = 0
    geocoded: int = 0
    no_coords: list[str] = field(default_factory=list)
    duplicates: int = 0


def _s(item: dict[str, Any], key: str) -> str:
    v = item.get(key)
    return "" if v is None else str(v).strip()


def _num(v: str) -> float | None:
    try:
        f = float(v)
    except ValueError:
        return None
    return f if f > 0 else None


def checked_date(item: dict[str, Any]) -> str | None:
    v = _s(item, "LAST_MDFCN_PNT") or _s(item, "DAT_UPDT_PNT")
    return v[:10] if len(v) >= 10 and v[4] == "-" else None


def item_sido(item: dict[str, Any]) -> str | None:
    return address_sido(_s(item, "ROAD_NM_ADDR") or _s(item, "LOTNO_ADDR"))


def first_token(item: dict[str, Any]) -> str:
    parts = (_s(item, "ROAD_NM_ADDR") or _s(item, "LOTNO_ADDR")).split()
    return parts[0] if parts else "(빈 주소)"


def places(items: list[dict[str, Any]], region_code: str, fetched_at: str, stats: MoisStats, geocoder: Geocoder | None = None, kind: Kind = VET) -> list[PetPlace]:
    stats.rows = len(items)
    seen: set[str] = set()
    result: list[PetPlace] = []
    for it in items:
        road, lot = _s(it, "ROAD_NM_ADDR"), _s(it, "LOTNO_ADDR")
        if item_sido(it) != region_code:
            continue
        stats.in_region += 1
        status_name = _s(it, "SALS_STTS_NM") or _s(it, "SALS_STTS_CD") or "(빈 값)"
        stats.by_status[status_name] += 1
        if _s(it, "SALS_STTS_CD") != OPEN:
            continue
        mng = _s(it, "MNG_NO")
        name = _s(it, "BPLC_NM")
        if not mng or not name:
            continue
        if mng in seen:
            stats.duplicates += 1
            continue
        seen.add(mng)
        address = clean_address(road) if road else clean_address(lot)

        x, y = _num(_s(it, "CRD_INFO_X")), _num(_s(it, "CRD_INFO_Y"))
        if x and y:
            lat, lng = to_wgs84(x, y)
        else:
            geo = geocoder.geocode(address, name) if geocoder else None
            if geo is None:
                stats.no_coords.append(f"{name} | {address}")
                continue
            lat, lng = geo.lat, geo.lng
            stats.geocoded += 1

        evidence = [
            Evidence(
                source=kind.source,  # type: ignore[arg-type]
                source_id=mng,
                type="OFFICIAL",
                pet_status="UNKNOWN",  # 인허가 자료에는 동반 정보가 없다
                checked_at=checked_date(it),
                fetched_at=fetched_at,
                claim=f"행정안전부 {kind.subcategory} 인허가: {_s(it, 'SALS_STTS_NM') or '영업/정상'}",
            )
        ]
        status, conflict = decide_pet_status(evidence)
        phone = _s(it, "TELNO")
        result.append(
            PetPlace(
                id=f"{kind.id_prefix}:{mng}",
                name=name,
                category="PET_SERVICE",
                subcategory=kind.subcategory,
                latitude=lat,
                longitude=lng,
                address=address,
                phone=phone if norm_phone(phone) else None,
                pet_status=status,
                pet_conditions=PetConditions(),
                evidence=evidence,
                conflicting_evidence=conflict,
                last_verified_at=last_verified_at(evidence),
            )
        )
        stats.used += 1
    return result
