"""한국관광공사 반려동물 동반여행 서비스(KorPetTourService2) 어댑터 — 아키텍처 §6.1, api-analysis §1.3-1.

- 위치기반 검색(locationBasedList2)은 구 지역코드 장소만 찾으므로 쓰지 않는다(실측). 시도 목록(lDongRegnCd)을 전부 받는다.
- 상세(detailPetTour2)는 modifiedtime 이 같으면 로컬 캐시를 재사용(증분)하고, 실행당 호출 상한을 둔다(일 1,000건 보호).
"""

from __future__ import annotations

import json
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from ..classify import has_indoor_space, kto_category
from ..models import Evidence, PetConditions, PetPlace
from ..parse import kto_pet_status, parse_kto_detail
from ..rules import decide_pet_status, last_verified_at

BASE = "https://apis.data.go.kr/B551011/KorPetTourService2"

Fetch = Callable[[str, dict[str, Any]], dict[str, Any]]  # (오퍼레이션, 파라미터) → 응답 JSON


class BudgetExceeded(Exception):
    pass


def items_of(resp: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    """items 가 "" / {"item": {...}} / {"item": [...]} 어느 형태여도 목록으로(실측: 정보 없으면 빈 문자열)."""
    body = resp.get("response", resp).get("body", {})
    header = resp.get("response", resp).get("header", {})
    if header.get("resultCode") not in (None, "0000"):
        raise RuntimeError(f"관광공사 오류 {header.get('resultCode')}: {header.get('resultMsg')}")
    items = body.get("items")
    if not items or isinstance(items, str):
        return [], int(body.get("totalCount") or 0)
    item = items.get("item", [])
    return (item if isinstance(item, list) else [item]), int(body.get("totalCount") or 0)


def http_fetcher(service_key: str) -> Fetch:
    from ..http import get_json

    key = service_key if "%" in service_key else urllib.parse.quote(service_key, safe="")

    def fetch(op: str, params: dict[str, Any]) -> dict[str, Any]:
        q = urllib.parse.urlencode({"MobileOS": "ETC", "MobileApp": "PawMap", "_type": "json", **params})
        return get_json(f"{BASE}/{op}?serviceKey={key}&{q}", secret=service_key)

    return fetch


@dataclass
class KtoStats:
    calls: int = 0
    listed: int = 0
    excluded_types: dict[str, int] = field(default_factory=dict)
    detail_cached: int = 0
    detail_fetched: int = 0
    detail_empty: int = 0
    parse_warnings: list[str] = field(default_factory=list)
    lcls_by_category: dict[str, dict[str, int]] = field(default_factory=dict)


class KtoSource:
    def __init__(self, fetch: Fetch, cache_dir: Path, max_calls: int = 800):
        self.fetch_raw = fetch
        self.cache_dir = cache_dir
        self.max_calls = max_calls
        self.stats = KtoStats()

    def _call(self, op: str, params: dict[str, Any]) -> dict[str, Any]:
        if self.stats.calls >= self.max_calls:
            raise BudgetExceeded(f"호출 상한 {self.max_calls}회 도달 — 내일 다시 실행하면 캐시된 상세는 재사용됩니다")
        self.stats.calls += 1
        return self.fetch_raw(op, params)

    def list_region(self, region_code: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        page = 1
        while True:
            items, total = items_of(self._call("areaBasedList2", {"lDongRegnCd": region_code, "numOfRows": 100, "pageNo": page}))
            out += items
            if not items or len(out) >= total:
                return out
            page += 1

    def detail(self, item: dict[str, Any]) -> dict[str, str] | None:
        cid = str(item["contentid"])
        path = self.cache_dir / f"{cid}.json"
        if path.exists():
            cached = json.loads(path.read_text(encoding="utf-8"))
            if cached.get("modifiedtime") == item.get("modifiedtime"):
                self.stats.detail_cached += 1
                return cached.get("detail")
        items, _ = items_of(self._call("detailPetTour2", {"contentId": cid}))
        self.stats.detail_fetched += 1
        detail = {k: str(v) for k, v in items[0].items()} if items else None
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"modifiedtime": item.get("modifiedtime"), "detail": detail}, ensure_ascii=False), encoding="utf-8")
        return detail

    def places(self, region_code: str, fetched_at: str) -> list[PetPlace]:
        result: list[PetPlace] = []
        self.stats = KtoStats(calls=self.stats.calls)  # 시도별 통계, 호출 수는 실행 전체 누적(상한 판단)
        listed = self.list_region(region_code)
        self.stats.listed = len(listed)
        for item in listed:
            type_id = str(item.get("contenttypeid"))
            category = kto_category(type_id, str(item.get("title", "")))
            if category is None:
                self.stats.excluded_types[type_id] = self.stats.excluded_types.get(type_id, 0) + 1
                continue
            lcls = str(item.get("lclsSystm3") or "")
            bucket = self.stats.lcls_by_category.setdefault(category, {})
            bucket[lcls] = bucket.get(lcls, 0) + 1
            detail = self.detail(item)
            if detail is None:
                self.stats.detail_empty += 1
            result.append(to_place(item, detail, category, fetched_at, self.stats.parse_warnings))
        return result


def _kto_date(modifiedtime: str | None) -> str | None:
    """관광공사 modifiedtime(YYYYMMDDHHMMSS) → YYYY-MM-DD."""
    t = str(modifiedtime or "")
    return f"{t[:4]}-{t[4:6]}-{t[6:8]}" if len(t) >= 8 and t[:8].isdigit() else None


def to_place(item: dict[str, Any], detail: dict[str, str] | None, category: str, fetched_at: str, warnings: list[str]) -> PetPlace:
    cid = str(item["contentid"])
    type_id = str(item.get("contenttypeid"))
    evidence: list[Evidence] = []
    conditions = PetConditions()
    if detail:
        parsed = parse_kto_detail(detail)
        warnings += [f"{cid} {item.get('title')}: {w}" for w in parsed.warnings]
        values: dict[str, Any] = {
            "max_weight_kg": parsed.max_weight_kg,
            "max_weight_exclusive": parsed.max_weight_exclusive,
            "no_weight_limit": parsed.no_weight_limit,
            "max_dogs": parsed.max_dogs,
            "leash_required": parsed.leash_required,
            "carrier_required": parsed.carrier_required,
            # D-7: 전구역 동반가능 + 실내 공간이 있는 업소 → 실내 가능
            "indoor_allowed": True if parsed.area == "ALL" and has_indoor_space(category, type_id) else None,  # type: ignore[arg-type]
        }
        set_values = {k: v for k, v in values.items() if v is not None}
        conditions = PetConditions(
            **set_values,
            notes=parsed.notes,
            field_sources={PetConditions.model_fields[k].alias: ["KTO_PET"] for k in set_values},  # type: ignore[misc]
        )
        raw = {k: v for k, v in detail.items() if k.startswith(("acmpy", "etc", "rela")) and v}
        evidence.append(
            Evidence(
                source="KTO_PET",
                source_id=cid,
                type="OFFICIAL",
                pet_status=kto_pet_status(detail.get("acmpyTypeCd")),  # type: ignore[arg-type]
                checked_at=_kto_date(item.get("modifiedtime")),
                fetched_at=fetched_at,
                claim=detail.get("acmpyTypeCd") or "반려동물 동반 정보",
                raw_text=raw or None,
            )
        )
    status, conflict = decide_pet_status(evidence)
    image = str(item.get("firstimage") or "") or None
    copyright_ = item.get("cpyrhtDivCd") if item.get("cpyrhtDivCd") in ("Type1", "Type3") else None
    return PetPlace(
        id=f"kto:{cid}",
        name=str(item.get("title", "")).strip(),
        category=category,  # type: ignore[arg-type]
        latitude=float(item["mapy"]),
        longitude=float(item["mapx"]),
        address=" ".join(str(item.get(k) or "") for k in ("addr1", "addr2")).strip() or None,
        phone=str(item.get("tel") or "") or None,
        # 이미지 저작권 구분이 없으면 이미지를 쓰지 않는다(이용조건 불명)
        image_url=image if copyright_ else None,
        image_copyright=copyright_,
        pet_status=status,
        pet_conditions=conditions,
        evidence=evidence,
        conflicting_evidence=conflict,
        last_verified_at=last_verified_at(evidence),
    )
