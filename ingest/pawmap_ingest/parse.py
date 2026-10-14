"""관광공사 동반 조건 원문 → 구조화 조건(요구사항 §6.3, 아키텍처 §6.3, D-7).

원칙: 명확한 패턴만 값으로 바꾸고, 나머지는 원문을 notes 에 남긴다. 애매하면 값을 비운다(= 확인 안 됨).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

_KG = re.compile(r"(\d+(?:\.\d+)?)\s*(?:kg|키로|킬로)\s*(이하|미만)", re.IGNORECASE)
_ALL_SIZES = re.compile(r"전\s*견종|모든\s*견종|견종\s*무관|크기\s*무관|전\s*크기")
_DOGS = re.compile(r"(\d+)\s*마리\s*(?:까지|이하|만)")
_LEASH = re.compile(r"목줄|리드줄|하네스")
_CARRIER = re.compile(r"이동장|켄넬|캐리어|이동\s*가방")
_AREA = {"전구역동반가능": "ALL", "일부구역동반가능": "PART"}


@dataclass
class ParsedConditions:
    max_weight_kg: float | None = None
    max_weight_exclusive: bool | None = None
    no_weight_limit: bool | None = None
    max_dogs: int | None = None
    leash_required: bool | None = None
    carrier_required: bool | None = None
    area: str | None = None  # "ALL" | "PART" | None
    notes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)  # 가공 보고서용(값을 비운 이유)


def _clean(text: str | None) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("\r", " ").replace("\n", " ")).strip()


def kto_pet_status(type_cd: str | None) -> str:
    """관광공사 동반 구역(acmpyTypeCd) → 동반 여부. 알 수 없는 표현은 UNKNOWN(임의 판단 금지)."""
    t = (type_cd or "").replace(" ", "")
    if "불가" in t:
        return "NOT_ALLOWED"
    if "동반가능" in t:
        return "ALLOWED"
    return "UNKNOWN"


def parse_kto_detail(detail: dict[str, str]) -> ParsedConditions:
    out = ParsedConditions()
    type_cd = _clean(detail.get("acmpyTypeCd"))
    cpam = _clean(detail.get("acmpyPsblCpam"))
    need = _clean(detail.get("acmpyNeedMtr"))
    etc = _clean(detail.get("etcAcmpyInfo"))

    out.area = _AREA.get(type_cd.replace(" ", ""))

    # 몸무게: 동반 가능 동물 필드를 우선, 없으면 기타 정보
    for text in (cpam, etc):
        kgs = {(float(v), unit) for v, unit in _KG.findall(text)}
        all_sizes = bool(_ALL_SIZES.search(text))
        if not kgs and not all_sizes:
            continue
        if len(kgs) == 1 and not all_sizes:
            (value, unit), = kgs
            out.max_weight_kg = value
            out.max_weight_exclusive = True if unit == "미만" else None
        elif all_sizes and not kgs:
            out.no_weight_limit = True
        else:
            out.warnings.append(f"몸무게 표현이 여러 개라 비움: {text}")
        break

    dogs = {int(n) for n in _DOGS.findall(" ".join((cpam, etc)))}
    if len(dogs) == 1:
        out.max_dogs = dogs.pop()
    elif len(dogs) > 1:
        out.warnings.append(f"마릿수 표현이 여러 개라 비움: {cpam} / {etc}")

    if _LEASH.search(need):
        out.leash_required = True
    if _CARRIER.search(need) or re.search(r"이동장[^,.]*필수", cpam):
        out.carrier_required = True

    out.notes = [t for t in (cpam, need, etc) if t]
    return out
