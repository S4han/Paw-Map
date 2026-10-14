"""출처 간 중복 판정·병합(요구사항 §7.4, 아키텍처 §6.4).

같은 장소로 보려면 좌표 50m 이내 **그리고** (정규화 이름 일치 또는 정규화 주소 일치 또는 전화번호 일치).
가깝기만 하고 나머지가 다르면 병합하지 않고 '검토 후보'로 보고서에 남긴다. 이름이 비슷하다는 것만으로는 합치지 않는다.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .models import PetConditions, PetPlace
from .normalize import norm_address, norm_name, norm_phone
from .rules import decide_pet_status, last_verified_at

NEAR_M = 50.0
_CONDITION_FIELDS = [
    "indoor_allowed",
    "outdoor_allowed",
    "max_weight_kg",
    "max_weight_exclusive",
    "no_weight_limit",
    "max_dogs",
    "carrier_required",
    "leash_required",
    "additional_fee_krw",
]


def distance_m(a: PetPlace, b: PetPlace) -> float:
    r = 6_371_000
    p1, p2 = math.radians(a.latitude), math.radians(b.latitude)
    dp, dl = p2 - p1, math.radians(b.longitude - a.longitude)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def same_place(a: PetPlace, b: PetPlace) -> bool:
    if distance_m(a, b) > NEAR_M:
        return False
    if norm_name(a.name) and norm_name(a.name) == norm_name(b.name):
        return True
    if a.address and b.address and norm_address(a.address) == norm_address(b.address):
        return True
    return bool(norm_phone(a.phone)) and norm_phone(a.phone) == norm_phone(b.phone)


@dataclass
class DedupeResult:
    places: list[PetPlace]
    merged: list[tuple[str, str]] = field(default_factory=list)
    review: list[tuple[str, str, float]] = field(default_factory=list)


def _same_or_none(a: bool | None, b: bool | None) -> bool | None:
    """한쪽만 알면 그 값, 둘이 다르면 모름(자동으로 고르지 않음)."""
    if a is None or b is None:
        return a if b is None else b
    return a if a == b else None


def merge(primary: PetPlace, other: PetPlace) -> PetPlace:
    """근거는 모두 유지하고 동반 상태·조건은 규칙으로 다시 계산한다(임의로 한쪽을 고르지 않음)."""
    evidence = primary.evidence + other.evidence
    status, conflict = decide_pet_status(evidence)
    a, b = primary.pet_conditions, other.pet_conditions
    values: dict[str, object] = {}
    conflicts = set(a.conflicts) | set(b.conflicts)
    sources: dict[str, list[str]] = {}
    for f in _CONDITION_FIELDS:
        alias = PetConditions.model_fields[f].alias
        va, vb = getattr(a, f), getattr(b, f)
        sources_f = sorted(set(a.field_sources.get(alias, [])) | set(b.field_sources.get(alias, [])))
        if va is not None and vb is not None and va != vb:
            conflicts.add(alias)  # 출처끼리 다르면 값을 비우고 충돌로 표시(요구사항 §7.3)
        elif va is not None or vb is not None:
            values[f] = va if va is not None else vb
        if sources_f:
            sources[alias] = sources_f
    # "전 견종"과 "N kg 이하"가 출처마다 다르면 몸무게 조건 전체가 충돌
    if values.get("no_weight_limit") and values.get("max_weight_kg") is not None:
        conflicts |= {"noWeightLimit", "maxWeightKg"}
    if "maxWeightKg" in conflicts:
        if values.pop("max_weight_exclusive", None) is not None:
            conflicts.add("maxWeightExclusive")
    for c in conflicts:  # 충돌 필드는 값을 두지 않는다
        values.pop(next(f for f in _CONDITION_FIELDS if PetConditions.model_fields[f].alias == c), None)
    conditions = PetConditions(
        **values,  # type: ignore[arg-type]
        notes=a.notes + [n for n in b.notes if n not in a.notes],
        field_sources=sources,  # type: ignore[arg-type]
        conflicts=sorted(conflicts),  # type: ignore[arg-type]
    )
    return primary.model_copy(
        update={
            "aliases": (primary.aliases or []) + [other.id],
            "address": primary.address or other.address,
            "phone": primary.phone or other.phone,
            "parking_available": _same_or_none(primary.parking_available, other.parking_available),
            "evidence": evidence,
            "pet_status": status,
            "conflicting_evidence": conflict,
            "pet_conditions": conditions,
            "last_verified_at": last_verified_at(evidence),
        }
    )


def dedupe(primary: list[PetPlace], secondary: list[PetPlace]) -> DedupeResult:
    """primary(관광공사) 를 기준으로 secondary(식약처) 를 합친다."""
    result = DedupeResult(places=list(primary))
    index = {p.id: i for i, p in enumerate(result.places)}
    for s in secondary:
        match = next((p for p in result.places[: len(primary)] if same_place(p, s)), None)
        if match:
            i = index[match.id]
            result.places[i] = merge(result.places[i], s)
            result.merged.append((match.id, s.id))
            continue
        for p in primary:
            d = distance_m(p, s)
            if d <= NEAR_M:
                result.review.append((p.id, s.id, round(d, 1)))
        result.places.append(s)
    return result
