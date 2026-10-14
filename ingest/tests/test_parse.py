"""조건 파싱 골든 테스트. 입력 원문은 STEP 2 실측 응답(제주 30건)과 커뮤니티 보고 예시."""

import pytest

from pawmap_ingest.parse import kto_pet_status, parse_kto_detail


@pytest.mark.parametrize(
    ("detail", "expected"),
    [
        # 실측: (가상 아님) 카페 — "12kg 이하", 기타 정보에 "3마리까지 가능"
        (
            {"acmpyTypeCd": "전구역 동반가능", "acmpyPsblCpam": "12kg 이하 동반 가능", "acmpyNeedMtr": "매너벨트 착용", "etcAcmpyInfo": "3마리까지 가능"},
            {"area": "ALL", "max_weight_kg": 12.0, "max_weight_exclusive": None, "max_dogs": 3, "no_weight_limit": None},
        ),
        # 실측: 리조트 — 대문자 KG, 수식어 "훈련된"
        (
            {"acmpyTypeCd": "전구역 동반가능", "acmpyPsblCpam": "훈련된 5KG 이하 반려견", "acmpyNeedMtr": "목줄 착용"},
            {"max_weight_kg": 5.0, "leash_required": True},
        ),
        # 실측: "미만"
        (
            {"acmpyTypeCd": "일부구역 동반가능", "acmpyPsblCpam": "15kg 미만 까지만 가능", "acmpyNeedMtr": "자유이용,매너벨트 착용"},
            {"area": "PART", "max_weight_kg": 15.0, "max_weight_exclusive": True, "leash_required": None},
        ),
        # 실측: 오름 — 전 견종
        (
            {"acmpyTypeCd": "전구역 동반가능", "acmpyPsblCpam": "전 견종 동반 가능", "acmpyNeedMtr": "목줄 착용"},
            {"no_weight_limit": True, "max_weight_kg": None},
        ),
        # 커뮤니티 보고: 이동장 필수가 가능 동물 필드에 들어 있음
        (
            {"acmpyTypeCd": "전구역 동반가능", "acmpyPsblCpam": "5kg 이하 동반 가능(이동장 이용 필수)"},
            {"max_weight_kg": 5.0, "carrier_required": True},
        ),
        # kg 기준이 없는 크기 표현은 추정하지 않는다
        ({"acmpyTypeCd": "전구역 동반가능", "acmpyPsblCpam": "소형견만 가능"}, {"max_weight_kg": None, "no_weight_limit": None}),
        # 상충하는 표현은 비운다
        ({"acmpyTypeCd": "전구역 동반가능", "acmpyPsblCpam": "실내 5kg 이하, 실외 15kg 이하"}, {"max_weight_kg": None}),
        # 정보가 없으면 모두 비어 있다
        ({"acmpyTypeCd": "전구역 동반가능"}, {"max_weight_kg": None, "max_dogs": None, "leash_required": None, "carrier_required": None}),
    ],
)
def test_parse_kto_detail(detail, expected):
    parsed = parse_kto_detail(detail)
    for key, value in expected.items():
        assert getattr(parsed, key) == value, key


def test_conflicting_weight_is_reported():
    parsed = parse_kto_detail({"acmpyPsblCpam": "실내 5kg 이하, 실외 15kg 이하"})
    assert parsed.warnings


def test_notes_keep_original_text():
    parsed = parse_kto_detail({"acmpyPsblCpam": "소형견만 가능", "etcAcmpyInfo": "맹견의 경우,\n입마개 착용 필수"})
    assert parsed.notes == ["소형견만 가능", "맹견의 경우, 입마개 착용 필수"]


@pytest.mark.parametrize(
    ("value", "expected"),
    [("전구역 동반가능", "ALLOWED"), ("일부구역 동반가능", "ALLOWED"), ("동반불가", "NOT_ALLOWED"), ("", "UNKNOWN"), ("문의 필요", "UNKNOWN")],
)
def test_kto_pet_status(value, expected):
    assert kto_pet_status(value) == expected
