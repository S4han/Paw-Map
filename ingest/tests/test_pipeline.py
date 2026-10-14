"""관광공사·식약처 어댑터, 병합, 출력까지 네트워크 없이 검증한다(가짜 응답)."""

import json

import pytest

from pawmap_ingest.build import BuildInputs, build_region, write_outputs
from pawmap_ingest.cli import validate
from pawmap_ingest.dedupe import dedupe
from pawmap_ingest.geocode import ADDRESS_URL, KEYWORD_URL, Geocoder
from pawmap_ingest.sources import mfds
from pawmap_ingest.sources.kto import BudgetExceeded, KtoSource, items_of

LIST = [
    # 실측 필드 구성(목록에 전화번호 없음). 좌표는 제주시 가상 위치
    {"contentid": "1001", "contenttypeid": "39", "title": "카페에벤에셀", "addr1": "제주특별자치도 제주시 가상로 1", "mapx": "126.5300", "mapy": "33.5000", "modifiedtime": "20260801103000", "firstimage": "http://img/1.jpg", "cpyrhtDivCd": "Type3", "lclsSystm3": "FD050100"},
    {"contentid": "1002", "contenttypeid": "12", "title": "갑선이오름", "addr1": "제주특별자치도 서귀포시 가상로 2", "mapx": "126.6", "mapy": "33.3", "modifiedtime": "20260920000000", "firstimage": "", "lclsSystm3": "NA010100"},
    {"contentid": "1003", "contenttypeid": "38", "title": "게스 제주점", "addr1": "제주특별자치도 제주시", "mapx": "126.5", "mapy": "33.5", "modifiedtime": "20260101000000"},
    {"contentid": "1004", "contenttypeid": "32", "title": "상세없는호텔", "addr1": "제주특별자치도 제주시 가상로 4", "mapx": "126.52", "mapy": "33.49", "modifiedtime": "20260101000000", "firstimage": "http://img/4.jpg"},
]
DETAILS = {
    "1001": {"contentid": "1001", "acmpyTypeCd": "전구역 동반가능", "acmpyPsblCpam": "12kg 이하 동반 가능", "acmpyNeedMtr": "매너벨트 착용", "etcAcmpyInfo": "3마리까지 가능"},
    "1002": {"contentid": "1002", "acmpyTypeCd": "전구역 동반가능", "acmpyPsblCpam": "전 견종 동반 가능", "acmpyNeedMtr": "목줄 착용"},
}


def ok(items, total=None):
    return {"response": {"header": {"resultCode": "0000"}, "body": {"items": {"item": items} if items else "", "totalCount": len(items) if total is None else total}}}


class FakeKto:
    def __init__(self):
        self.calls = []

    def __call__(self, op, params):
        self.calls.append((op, params))
        if op == "areaBasedList2":
            page = params["pageNo"]
            return ok(LIST[(page - 1) * 3 : page * 3], total=len(LIST)) if params["numOfRows"] == 100 else ok([])
        if op == "detailPetTour2":
            d = DETAILS.get(params["contentId"])
            return ok([d] if d else [])  # 정보 없으면 items = "" (실측)
        raise AssertionError(op)


def test_items_of_handles_all_shapes():
    assert items_of(ok([]))[0] == []
    assert items_of({"response": {"header": {"resultCode": "0000"}, "body": {"items": {"item": {"a": 1}}, "totalCount": 1}}})[0] == [{"a": 1}]
    with pytest.raises(RuntimeError):
        items_of({"response": {"header": {"resultCode": "30", "resultMsg": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}})


def test_kto_places(tmp_path):
    fake = FakeKto()
    src = KtoSource(fake, tmp_path / "cache")
    # 가짜 응답은 한 페이지에 3건씩 → 두 페이지를 받아야 4건이 모인다(페이지 넘김 확인)
    places = {p.id: p for p in src.places("50", "2026-10-13T09:00:00+09:00")}
    assert set(places) == {"kto:1001", "kto:1002", "kto:1004"}  # 쇼핑 제외
    cafe = places["kto:1001"]
    assert cafe.category == "CAFE"
    assert cafe.pet_status == "ALLOWED"
    c = cafe.pet_conditions
    assert (c.max_weight_kg, c.max_dogs, c.indoor_allowed) == (12.0, 3, True)  # D-7: 전구역 + 실내 업소
    assert c.field_sources["maxWeightKg"] == ["KTO_PET"]
    assert cafe.last_verified_at == "2026-08-01"
    assert cafe.evidence[0].checked_at == "2026-08-01" and cafe.evidence[0].fetched_at.startswith("2026-10-13")
    assert cafe.image_copyright == "Type3"

    oreum = places["kto:1002"]
    assert oreum.pet_conditions.no_weight_limit is True
    assert oreum.pet_conditions.indoor_allowed is None  # 야외 관광지는 실내 판정 안 함

    hotel = places["kto:1004"]
    assert hotel.pet_status == "UNKNOWN" and hotel.evidence == []  # 상세 근거가 없으면 동반 가능으로 보지 않는다
    assert hotel.image_url is None  # 저작권 구분이 없는 이미지는 쓰지 않는다
    assert src.stats.detail_empty == 1 and src.stats.excluded_types == {"38": 1}


def test_kto_detail_cache_and_budget(tmp_path):
    first = KtoSource(FakeKto(), tmp_path / "c")
    first.places("50", "t")
    second_fake = FakeKto()
    second = KtoSource(second_fake, tmp_path / "c")
    second.places("50", "t")
    assert [op for op, _ in second_fake.calls].count("detailPetTour2") == 0  # modifiedtime 같으면 캐시 재사용
    with pytest.raises(BudgetExceeded):
        KtoSource(FakeKto(), tmp_path / "x", max_calls=2).places("50", "t")


class FakeLookup:
    def __init__(self, table):
        self.table = table
        self.calls = []

    def __call__(self, url, query):
        self.calls.append((url, query))
        return self.table.get((url, query), [])


ROWS = [
    ["연번", "업소명", "업종", "지역", "업소주소"],
    ["1", "카페에벤에셀", "휴게음식점", "제주", "제주특별자치도 제주시 가상로 1(1층"],
    ["2", "바다식당", "일반음식점", "제주", "제주특별자치도 제주시 가상로 9"],
    ["3", "주소못찾음", "일반음식점", "제주", "제주특별자치도 제주시 없는길 0"],
    ["4", "서울집", "일반음식점", "서울", "서울특별시 중구 세종대로 110"],
    ["5", "바다식당", "일반음식점", "제주", "제주특별자치도 제주시 가상로 9"],  # 파일 내 중복
]
LOOKUP = {
    (ADDRESS_URL, "제주특별자치도 제주시 가상로 1"): [{"x": "126.53005", "y": "33.50003", "address_name": "제주특별자치도 제주시 가상로 1"}],
    (ADDRESS_URL, "제주특별자치도 제주시 가상로 9"): [{"x": "126.54", "y": "33.51", "address_name": "제주특별자치도 제주시 가상로 9"}],
    # 주소 실패 → 이름 검색 결과가 다른 지역이면 채택하지 않는다
    (KEYWORD_URL, "제주특별자치도 제주시 주소못찾음"): [{"x": "127.0", "y": "37.5", "address_name": "서울 중구 어딘가"}],
}


def test_mfds_places_and_geocode_cache(tmp_path):
    rows = mfds.parse_rows(ROWS)
    lookup = FakeLookup(LOOKUP)
    geo = Geocoder(lookup, tmp_path / "geo.json")
    stats = mfds.MfdsStats()
    places = mfds.places(rows, "50", geo, "2026-10-13", stats)
    assert [p.name for p in places] == ["카페에벤에셀", "바다식당"]
    assert stats.in_region == 4 and stats.duplicates_in_file == 1 and len(stats.failed) == 1
    cafe = places[0]
    assert cafe.category == "CAFE" and cafe.pet_status == "ALLOWED"
    assert cafe.evidence[0].checked_at is None and cafe.last_verified_at is None  # 식약처 파일에는 날짜가 없다
    assert cafe.pet_conditions.indoor_allowed is None  # 등재가 실내 허용을 보장하지 않음
    geo.save()

    again = FakeLookup(LOOKUP)
    mfds.places(rows, "50", Geocoder(again, tmp_path / "geo.json"), "2026-10-13", mfds.MfdsStats())
    assert again.calls == []  # 캐시로 재호출 없음


def test_dedupe_merges_same_place_and_flags_near_ones(tmp_path):
    kto = KtoSource(FakeKto(), tmp_path / "c").places("50", "t")
    m = mfds.places(mfds.parse_rows(ROWS), "50", Geocoder(FakeLookup(LOOKUP), tmp_path / "g.json"), "2026-10-13", mfds.MfdsStats())
    r = dedupe(kto, m)
    merged = next(p for p in r.places if p.id == "kto:1001")
    assert merged.aliases and merged.aliases[0].startswith("mfds:")
    assert {e.source for e in merged.evidence} == {"KTO_PET", "MFDS_PET"}
    assert merged.pet_status == "ALLOWED" and not merged.conflicting_evidence
    assert merged.last_verified_at == "2026-08-01"  # 관광공사 확인일 유지
    assert len(r.places) == 4  # 관광공사 3 + 식약처 중 병합 안 된 1


def test_dedupe_does_not_merge_by_proximity_alone(tmp_path):
    kto = KtoSource(FakeKto(), tmp_path / "c").places("50", "t")
    table = {(ADDRESS_URL, "제주특별자치도 제주시 다른로 7"): [{"x": "126.53002", "y": "33.50002"}]}
    rows = mfds.parse_rows([ROWS[0], ["1", "옆집국수", "일반음식점", "제주", "제주특별자치도 제주시 다른로 7"]])
    m = mfds.places(rows, "50", Geocoder(FakeLookup(table), tmp_path / "g.json"), "d", mfds.MfdsStats())
    r = dedupe(kto, m)
    assert r.merged == [] and len(r.review) == 1


def test_build_end_to_end_produces_valid_dataset(tmp_path):
    inp = BuildInputs(
        region_code="50",
        version="20261013",
        fetched_at="2026-10-13T09:00:00+09:00",
        kto=KtoSource(FakeKto(), tmp_path / "c"),
        mfds_rows=mfds.parse_rows(ROWS),
        mfds_fetched_at="2026-10-13",
        geocoder=Geocoder(FakeLookup(LOOKUP), tmp_path / "g.json"),
    )
    result = build_region(inp)
    report = result.report
    out = tmp_path / "live"
    write_outputs(out, inp, result)
    assert validate(out) == []
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["isMock"] is False and manifest["regions"][0]["count"] == 4
    assert {s["source"] for s in manifest["sources"]} == {"KTO_PET", "MFDS_PET"}
    data = json.loads((out / "places.50.json").read_text(encoding="utf-8"))
    cafe = next(p for p in data["places"] if p["id"] == "kto:1001")
    assert cafe["petConditions"]["maxWeightKg"] == 12.0 and "lastVerifiedAt" in cafe
    assert "병합 1건" in report.markdown()
