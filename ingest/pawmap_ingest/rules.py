"""동반 상태·확인일 판정 규칙(요구사항 §6.2, §7.2). 가공 단계와 데이터 검증이 같은 규칙을 쓴다."""

from __future__ import annotations

from .models import Evidence, PetPlace, PetStatus

# 판정에 쓰는 근거 유형. 관리자 확인 전 제보(USER_REPORT)는 쓰지 않는다(§6.2-4)
DECIDING_TYPES = {"OFFICIAL", "BUSINESS_CONFIRMED", "PROVIDER"}
# lastVerifiedAt 계산에 쓰는 근거 유형(§7.2)
VERIFYING_TYPES = {"OFFICIAL", "BUSINESS_CONFIRMED"}


def decide_pet_status(evidence: list[Evidence]) -> tuple[PetStatus, bool]:
    """(최종 동반 상태, 충돌 여부). 근거 없음 → UNKNOWN, 모두 같음 → 그 값, 다르면 UNKNOWN + 충돌."""
    claims = {e.pet_status for e in evidence if e.type in DECIDING_TYPES and e.pet_status != "UNKNOWN"}
    if not claims:
        return "UNKNOWN", False
    if len(claims) == 1:
        return next(iter(claims)), False
    return "UNKNOWN", True


def last_verified_at(evidence: list[Evidence]) -> str | None:
    dates = [e.checked_at for e in evidence if e.type in VERIFYING_TYPES and e.checked_at]
    return max(dates) if dates else None


def check_place(place: PetPlace) -> list[str]:
    """저장된 값이 규칙과 어긋나면 사유를 돌려준다(가공 결과·Mock 데이터 검증용)."""
    problems = []
    status, conflict = decide_pet_status(place.evidence)
    if place.pet_status != status:
        problems.append(f"petStatus={place.pet_status}, 규칙상 {status}")
    if place.conflicting_evidence != conflict:
        problems.append(f"conflictingEvidence={place.conflicting_evidence}, 규칙상 {conflict}")
    expected_date = last_verified_at(place.evidence)
    if place.last_verified_at != expected_date:
        problems.append(f"lastVerifiedAt={place.last_verified_at}, 규칙상 {expected_date}")
    return problems
