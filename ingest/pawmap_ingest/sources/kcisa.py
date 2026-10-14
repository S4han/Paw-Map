"""한국문화정보원 '전국 반려동물 동반 가능 문화시설 위치 데이터' CSV 어댑터(공공데이터포털 15111389).

실측(api-analysis 부록, 2026-10-14): 31열, 좌표·최종작성일·동반 가능(Y/N)·크기·제한사항·실내/실외·추가 요금이 있다.
- 우리 4개 카테고리에 해당하는 카테고리3은 장소로, 동물병원·약국·미용·용품은 '반려 생활'(PET_SERVICE)로 따로 낸다.
- 동반 가능 Y → ALLOWED, N → NOT_ALLOWED(출처가 명시한 값, 사용자 결정 2026-10-14). 그 밖의 값은 UNKNOWN.
- 최종작성일은 출처가 준 날짜 → checkedAt. 파일을 받은 날은 fetchedAt(섞지 않음).
- 원문을 조건으로 바꾸는 것은 명확한 표현만. "소형", "소형/중형"처럼 kg 기준이 없는 표현은 값으로 바꾸지 않고 notes 에 남긴다.
- "제한사항 없음"은 아무 값도 만들지 않는다("목줄 필수 아님"으로 해석하지 않음).
- "장소(실내/실외) 여부"는 반려견이 들어갈 수 있는 공간으로 해석한다(실측 값 조합 근거 🔷). 동반 가능 행에만 적용.
"""

from __future__ import annotations

import csv
import io
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from ..models import Category, Evidence, PetConditions, PetPlace, PetStatus
from ..normalize import norm_address, norm_name, norm_phone, stable_key
from ..regions import sido
from ..rules import decide_pet_status, last_verified_at

SOURCE = "KCISA_PET"
CATEGORY_MAP: dict[str, Category] = {
    "펜션": "STAY",
    "호텔": "STAY",
    "여행지": "ATTRACTION",
    "박물관": "ATTRACTION",
    "미술관": "ATTRACTION",
    "문예회관": "ATTRACTION",
    "카페": "CAFE",
    "식당": "RESTAURANT",
}
# 반려 생활 시설(사용자 결정 2026-10-14): 동반 장소가 아니라 반려견을 위한 시설. 별도 파일(services.{code}.json)로 내고
# 화면에서는 기본으로 꺼 둔다. 반려견 조건 매칭·코스 추천에는 쓰지 않는다.
SERVICE_TYPES = ("동물병원", "동물약국", "미용", "반려동물용품")
_EMPTY = {"", "-", "해당없음"}
_KG = re.compile(r"(\d+(?:\.\d+)?)\s*kg\s*(이하|미만)", re.IGNORECASE)
_DOGS = re.compile(r"(\d+)\s*마리")
_LEASH = re.compile(r"목줄|리드줄|하네스")
_CARRIER = re.compile(r"케이지|이동장|켄넬|캐리어")
_OUTDOOR_ONLY = re.compile(r"야외만|실외만")
_FEE = re.compile(r"^([\d,]+)\s*원$")
_DATE = re.compile(r"^(\d{4})[-./]?(\d{2})[-./]?(\d{2})")


@dataclass
class KcisaRow:
    name: str
    category3: str
    sido: str
    lat: str
    lng: str
    road_address: str
    jibun_address: str
    phone: str
    allowed: str
    size: str
    limits: str
    indoor: str
    outdoor: str
    fee: str
    updated: str
    parking: str = ""  # 선택 열: '주차 가능여부'(값 형식 ❓ — Y/N 만 값으로 바꾼다)


_COLUMNS = {
    "name": "시설명",
    "category3": "카테고리3",
    "sido": "시도 명칭",
    "lat": "위도",
    "lng": "경도",
    "road_address": "도로명주소",
    "jibun_address": "지번주소",
    "phone": "전화번호",
    "allowed": "반려동물 동반 가능정보",
    "size": "입장 가능 동물 크기",
    "limits": "반려동물 제한사항",
    "indoor": "장소(실내) 여부",
    "outdoor": "장소(실외)여부",
    "fee": "애견 동반 추가 요금",
    "updated": "최종작성일",
}


def read_csv(path: Path) -> list[KcisaRow]:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp949"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f"{path}: 인코딩을 알 수 없습니다(utf-8, cp949 실패)")
    return parse_rows(list(csv.DictReader(io.StringIO(text))))


def parse_rows(records: list[dict[str, str]]) -> list[KcisaRow]:
    if not records:
        return []
    header = {k.strip() for k in records[0] if k}
    missing = [c for c in _COLUMNS.values() if c not in header]
    if missing:
        raise ValueError(f"한국문화정보원 CSV 에 필요한 열이 없습니다: {missing}")
    rows = []
    for r in records:
        clean = {k.strip(): (v or "").strip() for k, v in r.items() if k}
        rows.append(KcisaRow(**{attr: clean[col] for attr, col in _COLUMNS.items()}, parking=clean.get("주차 가능여부", "")))
    return rows


@dataclass
class ParsedKcisa:
    pet_status: PetStatus
    values: dict[str, object] = field(default_factory=dict)  # PetConditions 필드명 → 값
    notes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def parse_conditions(row: KcisaRow) -> ParsedKcisa:
    status: PetStatus = "ALLOWED" if row.allowed == "Y" else "NOT_ALLOWED" if row.allowed == "N" else "UNKNOWN"
    out = ParsedKcisa(status)
    if status != "ALLOWED":  # 동반 불가·미확인 행의 크기·제한 열은 "해당없음"(실측) → 조건을 만들지 않음
        return out

    # 몸무게
    size = row.size
    if size == "모두 가능":
        out.values["no_weight_limit"] = True
    elif size not in _EMPTY:
        kgs = {(float(v), unit) for v, unit in _KG.findall(size)}
        if len(kgs) == 1:
            (value, unit), = kgs
            out.values["max_weight_kg"] = value
            if unit == "미만":
                out.values["max_weight_exclusive"] = True
        elif len(kgs) > 1:
            out.warnings.append(f"몸무게 표현이 여러 개라 비움: {size}")
        out.notes.append(f"입장 가능 크기: {size}")  # "소형/중형" 등은 kg 으로 바꾸지 않고 원문만

    # 제한사항
    limits = row.limits
    outdoor_only = False
    if limits not in _EMPTY and limits != "제한사항 없음":
        dogs = {int(n) for n in _DOGS.findall(limits)}
        if len(dogs) == 1:
            out.values["max_dogs"] = dogs.pop()
        elif len(dogs) > 1:
            out.warnings.append(f"마릿수 표현이 여러 개라 비움: {limits}")
        if _LEASH.search(limits):
            out.values["leash_required"] = True
        if _CARRIER.search(limits):
            out.values["carrier_required"] = True
        outdoor_only = bool(_OUTDOOR_ONLY.search(limits))
        out.notes.append(f"제한사항: {limits}")

    # 실내·실외(반려견이 들어갈 수 있는 공간)
    flags = {"Y": True, "N": False}
    indoor, outdoor = flags.get(row.indoor), flags.get(row.outdoor)
    if outdoor_only:
        if indoor is True:
            out.warnings.append(f"'{limits}' 인데 실내 여부 Y — 실내 값을 비움")
            indoor = None
        else:
            indoor = False
        outdoor = True if outdoor is not False else None
    if indoor is not None:
        out.values["indoor_allowed"] = indoor
    if outdoor is not None:
        out.values["outdoor_allowed"] = outdoor

    # 추가 요금
    fee = row.fee
    if fee == "없음":
        out.values["additional_fee_krw"] = 0
    elif m := _FEE.match(fee):
        out.values["additional_fee_krw"] = int(m.group(1).replace(",", ""))
    elif fee not in _EMPTY:
        out.notes.append(f"추가 요금: {fee}")
    return out


def checked_date(updated: str) -> str | None:
    m = _DATE.match(updated.strip())
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


def _float(s: str) -> float | None:
    try:
        v = float(s)
    except ValueError:
        return None
    return v if v != 0 else None


@dataclass
class KcisaStats:
    rows: int = 0
    in_region: int = 0
    by_category3: Counter[str] = field(default_factory=Counter)
    used: int = 0
    services_used: int = 0
    no_coords: list[str] = field(default_factory=list)
    duplicates_in_file: int = 0
    no_date: int = 0
    warnings: list[str] = field(default_factory=list)


def places(rows: list[KcisaRow], region_code: str, fetched_at: str, stats: KcisaStats) -> list[PetPlace]:
    return split_places(rows, region_code, fetched_at, stats)[0]


def split_places(rows: list[KcisaRow], region_code: str, fetched_at: str, stats: KcisaStats) -> tuple[list[PetPlace], list[PetPlace]]:
    """(동반 장소, 반려 생활 시설) — 지역에 속한 행을 카테고리3 으로 나눈다. 그 밖의 분류는 버린다(보고서에 건수)."""
    prefixes = sido(region_code).prefixes
    stats.rows = len(rows)
    seen: set[str] = set()
    result: list[PetPlace] = []
    services: list[PetPlace] = []
    for row in rows:
        if not row.sido.startswith(prefixes):
            continue
        stats.in_region += 1
        stats.by_category3[row.category3] += 1
        is_service = row.category3 in SERVICE_TYPES
        category: Category | None = "PET_SERVICE" if is_service else CATEGORY_MAP.get(row.category3)
        if category is None:
            continue
        lat, lng = _float(row.lat), _float(row.lng)
        if lat is None or lng is None:
            stats.no_coords.append(row.name)
            continue
        address = row.road_address or row.jibun_address or None
        key = stable_key(norm_name(row.name), norm_address(address or f"{lat:.5f},{lng:.5f}"))
        if key in seen:
            stats.duplicates_in_file += 1
            continue
        seen.add(key)

        parsed = parse_conditions(row)
        stats.warnings += [f"{row.name}: {w}" for w in parsed.warnings]
        checked = checked_date(row.updated)
        if checked is None:
            stats.no_date += 1
        claim = {
            "ALLOWED": f"한국문화정보원 반려동물 동반 가능({row.category3})",
            "NOT_ALLOWED": f"한국문화정보원 반려동물 동반 불가({row.category3})",
            "UNKNOWN": f"한국문화정보원 동반 정보 미확인({row.category3})",
        }[parsed.pet_status]
        raw = {k: v for k, v in (("크기", row.size), ("제한사항", row.limits), ("실내", row.indoor), ("실외", row.outdoor), ("추가요금", row.fee)) if v not in _EMPTY}
        evidence = [
            Evidence(source=SOURCE, source_id=key, type="OFFICIAL", pet_status=parsed.pet_status, checked_at=checked, fetched_at=fetched_at, claim=claim, raw_text=raw or None)
        ]
        status, conflict = decide_pet_status(evidence)
        aliases = {f: PetConditions.model_fields[f].alias for f in parsed.values}
        place = PetPlace(
            id=f"kcisa:{key}",
            name=row.name,
            category=category,
            subcategory=row.category3,
            latitude=lat,
            longitude=lng,
            address=address,
            phone=row.phone if norm_phone(row.phone) else None,
            parking_available={"Y": True, "N": False}.get(row.parking),
            pet_status=status,
            pet_conditions=PetConditions(
                **parsed.values,  # type: ignore[arg-type]
                notes=parsed.notes,
                field_sources={alias: [SOURCE] for alias in aliases.values()},  # type: ignore[misc]
            ),
            evidence=evidence,
            conflicting_evidence=conflict,
            last_verified_at=last_verified_at(evidence),
        )
        if is_service:
            services.append(place)
            stats.services_used += 1
        else:
            result.append(place)
            stats.used += 1
    return result, services
