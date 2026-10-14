"""EPSG:5174 → WGS84 변환: 투영 왕복과 원점·기준계 이동 크기(실주소 대조는 poc/localdata_animal.py)."""

from pawmap_ingest.epsg5174 import tm_forward, tm_inverse, to_wgs84


def test_tm_round_trip_across_korea():
    for lat, lng in [(38.0, 127.0028902777778), (37.5665, 126.978), (33.25, 126.56), (35.18, 129.08), (38.3, 128.6), (34.8, 126.4)]:
        x, y = tm_forward(lat, lng)
        back_lat, back_lng = tm_inverse(x, y)
        assert abs(back_lat - lat) * 111_000 < 0.01  # 1cm 미만
        assert abs(back_lng - lng) * 88_000 < 0.01


def test_origin_maps_to_false_origin():
    x, y = tm_forward(38.0, 127.0028902777778)
    assert abs(x - 200000) < 1e-6 and abs(y - 500000) < 1e-6


def test_datum_shift_is_a_few_hundred_metres_north_west():
    # Bessel(동경 측지계) → WGS84 는 한반도에서 북쪽으로 약 300m, 서쪽으로 약 200m 옮겨진다
    lat, lng = to_wgs84(200000, 500000)
    assert 250 < (lat - 38.0) * 111_000 < 350
    assert 150 < (127.0028902777778 - lng) * 88_000 < 250
