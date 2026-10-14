import pytest

from pawmap_ingest.classify import has_indoor_space, kto_category, mfds_category
from pawmap_ingest.normalize import clean_address, norm_name, norm_phone


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # 실측 예: 닫히지 않은 괄호·층 정보
        ("서울특별시 마포구 성미산로29길 17-8(1,2,지1층", "서울특별시 마포구 성미산로29길 17-8"),
        ("제주특별자치도 제주시 중앙로 12, 2층", "제주특별자치도 제주시 중앙로 12"),
        ("제주특별자치도 서귀포시 중정로 5 1층", "제주특별자치도 서귀포시 중정로 5"),
        ("제주특별자치도 제주시 연동 123 지하1층 101호", "제주특별자치도 제주시 연동 123"),
        ("  제주특별자치도   제주시  연삼로 1 ", "제주특별자치도 제주시 연삼로 1"),
    ],
)
def test_clean_address(raw, expected):
    assert clean_address(raw) == expected


def test_norm_name_and_phone():
    assert norm_name("카페 에벤에셀 (제주점)") == norm_name("카페에벤에셀")
    assert norm_phone("064-123-4567") == norm_phone("(064)1234567") == "41234567"
    assert norm_phone("") == ""


def test_kto_category():
    assert kto_category("12", "갑선이오름") == "ATTRACTION"
    assert kto_category("39", "카페에벤에셀") == "CAFE"
    assert kto_category("39", "흑돼지식당") == "RESTAURANT"
    assert kto_category("32", "돈내코힐 리조트") == "STAY"
    assert kto_category("38", "게스 제주점") is None  # 쇼핑 제외


def test_mfds_category():
    assert mfds_category("일반음식점", "바다식당") == "RESTAURANT"
    assert mfds_category("휴게음식점", "멍멍분식") == "CAFE"
    assert mfds_category("제과점영업", "오름빵집") == "CAFE"
    assert mfds_category("일반음식점", "브런치 카페 소랑") == "CAFE"


def test_indoor_space():
    assert has_indoor_space("CAFE") and has_indoor_space("STAY")
    assert has_indoor_space("ATTRACTION", "14")  # 문화시설
    assert not has_indoor_space("ATTRACTION", "12")  # 야외 관광지
