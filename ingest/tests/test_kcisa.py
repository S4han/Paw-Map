"""한국문화정보원 CSV 어댑터: 원문 → 조건 변환 규칙과 기존 출처와의 병합(네트워크·실파일 없이)."""

import pytest

from pawmap_ingest.build import BuildInputs, build_region
from pawmap_ingest.dedupe import dedupe
from pawmap_ingest.models import Evidence, PetConditions, PetPlace
from pawmap_ingest.sources import kcisa
from pawmap_ingest.sources.kcisa import KcisaRow, checked_date, parse_conditions, parse_rows

HEADER = [
    "시설명", "카테고리1", "카테고리2", "카테고리3", "시도 명칭", "위도", "경도", "도로명주소", "지번주소", "전화번호",
    "반려동물 동반 가능정보", "입장 가능 동물 크기", "반려동물 제한사항", "장소(실내) 여부", "장소(실외)여부", "애견 동반 추가 요금", "최종작성일",
]


def row(**kw: str) -> KcisaRow:
    base = dict(
        name="가상펜션", category3="펜션", sido="제주특별자치도", lat="33.5", lng="126.53", road_address="제주특별자치도 제주시 가상로 1",
        jibun_address="", phone="064-000-0001", allowed="Y", size="모두 가능", limits="제한사항 없음", indoor="Y", outdoor="Y", fee="없음", updated="2022-11-01",
    )
    base.update(kw)
    return KcisaRow(**base)


@pytest.mark.parametrize(
    "size, expected",
    [
        ("모두 가능", {"no_weight_limit": True}),
        ("5kg 이하", {"max_weight_kg": 5.0}),
        ("7kg 미만", {"max_weight_kg": 7.0, "max_weight_exclusive": True}),
        ("5kg 미만 소형", {"max_weight_kg": 5.0, "max_weight_exclusive": True}),
        ("소형/중형", {}),  # kg 기준이 없는 표현은 값으로 바꾸지 않음
        ("해당없음", {}),
    ],
)
def test_size(size, expected):
    values = parse_conditions(row(size=size, limits="해당없음", indoor="", outdoor="", fee="")).values
    weight = {k: v for k, v in values.items() if "weight" in k}
    assert weight == expected


def test_kg_less_size_kept_as_note():
    p = parse_conditions(row(size="소형/중형"))
    assert "max_weight_kg" not in p.values and "no_weight_limit" not in p.values
    assert "입장 가능 크기: 소형/중형" in p.notes


def test_limits():
    p = parse_conditions(row(limits="고양이 불가, 객실당 최대 2마리, 애견용품 개별준비"))
    assert p.values["max_dogs"] == 2
    assert "제한사항: 고양이 불가, 객실당 최대 2마리, 애견용품 개별준비" in p.notes
    p = parse_conditions(row(limits="목줄, 케이지 이용"))
    assert p.values["leash_required"] is True and p.values["carrier_required"] is True


def test_no_limits_is_not_false():
    """'제한사항 없음'을 '목줄 필수 아님'으로 바꾸지 않는다(모르는 것은 None)."""
    p = parse_conditions(row(limits="제한사항 없음"))
    assert "leash_required" not in p.values and "carrier_required" not in p.values and "max_dogs" not in p.values


def test_indoor_outdoor_and_outdoor_only():
    p = parse_conditions(row(indoor="N", outdoor="Y"))
    assert p.values["indoor_allowed"] is False and p.values["outdoor_allowed"] is True
    p = parse_conditions(row(limits="야외만 반려동물 동반 가능", indoor="N", outdoor="Y"))
    assert p.values["indoor_allowed"] is False and p.values["outdoor_allowed"] is True
    # 제한사항과 실내 여부가 서로 다르면 실내 값을 비우고 경고
    p = parse_conditions(row(limits="야외만 동반 가능", indoor="Y", outdoor="Y"))
    assert "indoor_allowed" not in p.values and p.warnings


@pytest.mark.parametrize("fee, expected, note", [("없음", 0, None), ("20,000원", 20000, None), ("변동", None, "추가 요금: 변동")])
def test_fee(fee, expected, note):
    p = parse_conditions(row(fee=fee))
    assert p.values.get("additional_fee_krw") == expected
    assert (note in p.notes) if note else not any(n.startswith("추가 요금") for n in p.notes)


def test_not_allowed_has_no_conditions():
    p = parse_conditions(row(allowed="N", size="해당없음", limits="해당없음", indoor="N", outdoor="N"))
    assert p.pet_status == "NOT_ALLOWED" and p.values == {} and p.notes == []
    assert parse_conditions(row(allowed="")).pet_status == "UNKNOWN"


def test_checked_date():
    assert checked_date("2022-11-01") == "2022-11-01"
    assert checked_date("20250324") == "2025-03-24"
    assert checked_date("2025.03.24 10:00") == "2025-03-24"
    assert checked_date("") is None


def test_parse_rows_requires_columns():
    with pytest.raises(ValueError):
        parse_rows([{"시설명": "x"}])
    rows = parse_rows([dict.fromkeys(HEADER, "") | {"시설명": " 가상카페 ", "카테고리3": "카페"}])
    assert rows[0].name == "가상카페" and rows[0].category3 == "카페"


def test_places_filters_region_and_category():
    rows = [
        row(),
        row(name="가상약국", category3="동물약국"),  # 4개 카테고리 밖
        row(name="서울펜션", sido="서울특별시"),
        row(name="좌표없음", lat="", lng=""),
        row(),  # 같은 행 중복
        row(name="가상미술관", category3="미술관", allowed="N", size="해당없음", limits="해당없음", indoor="N", outdoor="N", updated="2025-03-24", road_address="제주시 2"),
    ]
    stats = kcisa.KcisaStats()
    out = {p.name: p for p in kcisa.places(rows, "50", "2026-10-14", stats)}
    assert set(out) == {"가상펜션", "가상미술관"}
    assert stats.in_region == 5 and stats.used == 2 and stats.duplicates_in_file == 1 and stats.no_coords == ["좌표없음"]

    pension = out["가상펜션"]
    assert pension.category == "STAY" and pension.pet_status == "ALLOWED"
    assert pension.pet_conditions.no_weight_limit is True and pension.pet_conditions.additional_fee_krw == 0
    assert pension.pet_conditions.field_sources["noWeightLimit"] == ["KCISA_PET"]
    ev = pension.evidence[0]
    assert ev.checked_at == "2022-11-01" and ev.fetched_at == "2026-10-14"  # 확인일과 받은 날을 섞지 않음
    assert pension.last_verified_at == "2022-11-01"

    museum = out["가상미술관"]
    assert museum.category == "ATTRACTION" and museum.pet_status == "NOT_ALLOWED"
    assert museum.evidence[0].claim == "한국문화정보원 반려동물 동반 불가(미술관)"


def test_merge_with_existing_source_and_conflict():
    """기존 출처(식약처: 동반 가능)와 같은 장소인데 한국문화정보원은 불가 → 미확인 + 충돌(자동으로 고르지 않음)."""
    existing = PetPlace(
        id="mfds:abc", name="가상카페", category="CAFE", latitude=33.5, longitude=126.53, address="제주특별자치도 제주시 가상로 1",
        pet_status="ALLOWED", pet_conditions=PetConditions(),
        evidence=[Evidence(source="MFDS_PET", type="OFFICIAL", pet_status="ALLOWED", fetched_at="2026-10-13", claim="식약처 등록")],
        conflicting_evidence=False,
    )
    new = kcisa.places([row(name="가상카페", category3="카페", allowed="N", size="해당없음", limits="해당없음", indoor="N", outdoor="N")], "50", "2026-10-14", kcisa.KcisaStats())
    result = dedupe([existing], new)
    assert len(result.places) == 1 and len(result.merged) == 1
    merged = result.places[0]
    assert merged.id == "mfds:abc" and merged.aliases and merged.aliases[0].startswith("kcisa:")
    assert merged.pet_status == "UNKNOWN" and merged.conflicting_evidence is True
    assert merged.last_verified_at == "2022-11-01"


def test_build_region_reports_kcisa():
    inp = BuildInputs(region_code="50", version="20261014", fetched_at="2026-10-14T09:00:00+09:00", kcisa_rows=[row(), row(name="가상약국", category3="동물약국")], kcisa_fetched_at="2026-10-14")
    places, report, sources = build_region(inp)
    assert [s.source for s in sources] == ["KCISA_PET"] and len(places) == 1
    text = report.markdown()
    assert "한국문화정보원 반려동물 동반 시설" in text and "동물약국" in text and "기존 ← 한국문화정보원: 병합 0건" in text
