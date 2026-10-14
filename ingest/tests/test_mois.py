"""행정안전부 동물병원 인허가 어댑터: 영업 중만, 좌표 변환, 시도 나누기, 페이지 받기, 한국문화정보원과 병합(네트워크 없이)."""

from pawmap_ingest.build import BuildInputs, build_region
from pawmap_ingest.epsg5174 import to_wgs84
from pawmap_ingest.sources import mois
from pawmap_ingest.sources.kcisa import KcisaRow


def item(mng: str, name: str, road: str, status: str = "01", x: str = "204264.267630355", y: str = "446792.780552867", **extra: str) -> dict:
    return {
        "MNG_NO": mng,
        "BPLC_NM": name,
        "ROAD_NM_ADDR": road,
        "LOTNO_ADDR": "",
        "SALS_STTS_CD": status,
        "SALS_STTS_NM": {"01": "영업/정상", "03": "폐업"}.get(status, status),
        "CRD_INFO_X": x,
        "CRD_INFO_Y": y,
        "TELNO": "02-518-0207",
        "LAST_MDFCN_PNT": "2026-10-12 15:53:02",
        **extra,
    }


def test_only_open_hospitals_in_region_with_converted_coords():
    items = [
        item("1", "청담동물병원", "서울특별시 강남구 도산대로90길 17, 소양빌딩 201호"),
        item("2", "문닫은동물병원", "서울특별시 강남구 도산대로 1", status="03"),
        item("3", "여주동물병원", "경기도 여주시 금사면 금사로 67", x="247270.276021554", y="433963.369945577"),
        item("1", "청담동물병원", "서울특별시 강남구 도산대로90길 17, 소양빌딩 201호"),  # 같은 관리번호
    ]
    stats = mois.MoisStats()
    result = mois.places(items, "11", "2026-10-14", stats)
    assert [p.name for p in result] == ["청담동물병원"]
    p = result[0]
    assert p.id == "mois:1" and p.category == "PET_SERVICE" and p.subcategory == "동물병원"
    assert p.address == "서울특별시 강남구 도산대로90길 17"  # 쉼표 뒤 상세 위치는 뺀다
    assert (p.latitude, p.longitude) == to_wgs84(204264.267630355, 446792.780552867)
    assert stats.in_region == 3 and stats.duplicates == 1 and stats.by_status == {"영업/정상": 2, "폐업": 1}


def test_unknown_pet_status_and_dates_kept_apart():
    p = mois.places([item("1", "청담동물병원", "서울특별시 강남구 도산대로 1")], "11", "2026-10-14", mois.MoisStats())[0]
    assert p.pet_status == "UNKNOWN" and not p.conflicting_evidence  # 인허가 자료에는 동반 정보가 없다
    e = p.evidence[0]
    assert e.source == "MOIS_VET" and e.checked_at == "2026-10-12" and e.fetched_at == "2026-10-14"
    assert p.last_verified_at == "2026-10-12"


def test_missing_coords_dropped_without_geocoder():
    stats = mois.MoisStats()
    assert mois.places([item("1", "좌표없는병원", "서울특별시 중구 세종대로 110", x="", y="")], "11", "2026-10-14", stats) == []
    assert stats.no_coords == ["좌표없는병원 | 서울특별시 중구 세종대로 110"]


def _page(items: list[dict], total: int) -> dict:
    return {"response": {"header": {"resultCode": "0", "resultMsg": "정상"}, "body": {"totalCount": total, "items": {"item": items}}}}


def test_fetch_all_pages_until_total():
    data = [item(str(i), f"병원{i}", "서울특별시 중구 1") for i in range(5)]
    calls: list[tuple[int, int]] = []

    def fetch(page: int, rows: int) -> dict:
        calls.append((page, rows))
        return _page(data[(page - 1) * rows : page * rows], len(data))

    items, n = mois.fetch_all(fetch, rows_per_page=2)
    assert len(items) == 5 and n == 3 and calls == [(1, 2), (2, 2), (3, 2)]


def test_fetch_error_code_raises():
    def fetch(page: int, rows: int) -> dict:
        return {"response": {"header": {"resultCode": "30", "resultMsg": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}}

    try:
        mois.fetch_all(fetch)
    except RuntimeError as e:
        assert "30" in str(e)
    else:
        raise AssertionError("오류 코드인데 예외가 없음")


def test_cache_reused_same_day(tmp_path):
    cache = tmp_path / "mois_vet.json"
    data = [item("1", "병원", "서울특별시 중구 1")]
    fetched = []

    def fetch(page: int, rows: int) -> dict:
        fetched.append(page)
        return _page(data, 1)

    assert mois.load_or_fetch(fetch, cache, "2026-10-14")[2] == 1
    assert mois.load_or_fetch(fetch, cache, "2026-10-14")[2] == 0
    assert mois.load_or_fetch(fetch, cache, "2026-10-15")[2] == 1
    assert fetched == [1, 1]


def test_merges_into_kcisa_hospital_keeping_kcisa_id():
    lat, lng = to_wgs84(204264.267630355, 446792.780552867)
    kcisa_row = KcisaRow(
        name="청담동물병원", category3="동물병원", sido="서울특별시", lat=str(lat), lng=str(lng), road_address="서울특별시 강남구 도산대로90길 17",
        jibun_address="", phone="02-518-0207", allowed="Y", size="", limits="", indoor="", outdoor="", fee="", updated="2022-11-30",
    )
    inp = BuildInputs(
        region_code="11", version="20261014", fetched_at="2026-10-14T00:00:00+09:00",
        kcisa_rows=[kcisa_row], kcisa_fetched_at="2026-10-14",
        mois={"vet": [item("1", "청담동물병원", "서울특별시 강남구 도산대로90길 17"), item("9", "새동물병원", "서울특별시 강남구 도산대로 9", x="204800", y="446900")]},
        mois_fetched_at="2026-10-14",
    )
    result = build_region(inp)
    by_name = {p.name: p for p in result.services}
    merged = by_name["청담동물병원"]
    assert merged.id.startswith("kcisa:") and merged.aliases == ["mois:1"]
    assert merged.pet_status == "ALLOWED" and not merged.conflicting_evidence  # 미확인 근거는 충돌이 아니다
    assert merged.last_verified_at == "2026-10-12"  # 두 출처의 확인일 중 최근
    assert by_name["새동물병원"].pet_status == "UNKNOWN"
    assert any(s.source == "MOIS_VET" for s in result.sources)


def test_pharmacy_kind_uses_its_own_source_id_and_subcategory():
    p = mois.places([item("7", "청담동물약국", "서울특별시 강남구 도산대로 1")], "11", "2026-10-14", mois.MoisStats(), kind=mois.PHARMACY)[0]
    assert p.id == "moisph:7" and p.subcategory == "동물약국"
    assert p.evidence[0].source == "MOIS_PHARMACY" and "동물약국" in p.evidence[0].claim


def test_hospital_and_pharmacy_in_same_building_stay_separate():
    inp = BuildInputs(
        region_code="11", version="20261014", fetched_at="2026-10-14T00:00:00+09:00",
        mois={
            "vet": [item("1", "청담동물병원", "서울특별시 강남구 도산대로90길 17")],
            "pharmacy": [item("1", "청담약국", "서울특별시 강남구 도산대로90길 17")],  # 주소·전화·좌표가 같아도
        },
        mois_fetched_at="2026-10-14",
    )
    result = build_region(inp)
    assert sorted(p.subcategory for p in result.services) == ["동물병원", "동물약국"]
    assert {s.source for s in result.sources} == {"MOIS_VET", "MOIS_PHARMACY"}


def test_merged_gwangju_jeonnam_split_by_district():
    from pawmap_ingest.regions import address_sido

    assert address_sido("전남광주통합특별시 광산구 풍영철길로 20-6") == "29"
    assert address_sido("전남광주통합특별시 북구 유동길 46") == "29"
    assert address_sido("전남광주통합특별시 영광군 영광읍 대하길2길 4") == "46"
    assert address_sido("전라남도 순천시 1") == "46" and address_sido("광주광역시 서구 1") == "29"
    assert address_sido("경기도 광주시 1") == "41"
    assert address_sido("어딘가특별시 1") is None and address_sido("") is None
    items = [item("1", "광산동물병원", "전남광주통합특별시 광산구 풍영철길로 20-6"), item("2", "영광동물병원", "전남광주통합특별시 영광군 영광읍 1")]
    assert [p.name for p in mois.places(items, "29", "2026-10-14", mois.MoisStats())] == ["광산동물병원"]
    assert [p.name for p in mois.places(items, "46", "2026-10-14", mois.MoisStats())] == ["영광동물병원"]
