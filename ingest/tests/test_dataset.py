from pathlib import Path

import pytest
from pydantic import ValidationError

from pawmap_ingest.cli import validate
from pawmap_ingest.models import Evidence, PetConditions
from pawmap_ingest.rules import decide_pet_status, last_verified_at

MOCK = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "mock"


def ev(status, typ="OFFICIAL", checked=None):
    return Evidence(source="MOCK", type=typ, pet_status=status, fetched_at="2026-10-13", claim="x", checked_at=checked)


def test_mock_dataset_is_valid():
    assert validate(MOCK) == []


@pytest.mark.parametrize(
    ("evidence", "expected"),
    [
        ([], ("UNKNOWN", False)),
        ([ev("ALLOWED")], ("ALLOWED", False)),
        ([ev("ALLOWED"), ev("ALLOWED", "PROVIDER")], ("ALLOWED", False)),
        ([ev("ALLOWED"), ev("NOT_ALLOWED", "PROVIDER")], ("UNKNOWN", True)),
        ([ev("NOT_ALLOWED")], ("NOT_ALLOWED", False)),
        # 관리자 확인 전 제보는 판정에 쓰지 않는다
        ([ev("ALLOWED"), ev("NOT_ALLOWED", "USER_REPORT")], ("ALLOWED", False)),
        ([ev("NOT_ALLOWED", "USER_REPORT")], ("UNKNOWN", False)),
    ],
)
def test_decide_pet_status(evidence, expected):
    assert decide_pet_status(evidence) == expected


def test_last_verified_at_uses_official_dates_only():
    assert last_verified_at([ev("ALLOWED", checked="2026-01-01"), ev("ALLOWED", "PROVIDER", checked="2026-09-09")]) == "2026-01-01"
    assert last_verified_at([ev("ALLOWED")]) is None


def test_conditions_reject_contradictions():
    with pytest.raises(ValidationError):
        PetConditions(no_weight_limit=True, max_weight_kg=5)
    with pytest.raises(ValidationError):
        PetConditions(max_weight_exclusive=True)


def test_unknown_fields_rejected():
    # 프론트 타입과 어긋난 필드가 조용히 들어오지 않도록 한다
    with pytest.raises(ValidationError):
        PetConditions.model_validate({"notes": [], "fieldSources": {}, "conflicts": [], "allowsBigDogs": True})
