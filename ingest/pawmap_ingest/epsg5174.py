"""EPSG:5174(보정계수 없는 Bessel 중부원점 TM) → WGS84 위경도. 표준 라이브러리만 사용.

지방행정 인허가 데이터(행정안전부, 공공데이터포털)의 좌표정보(X·Y)가 이 좌표계다.
매개변수는 EPSG:5174 의 proj 정의와 같다:
  +proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel
  +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 (위치 벡터 방식)
정확도는 실측(카카오 주소 검색과의 거리)으로 확인한다 — poc/localdata_animal.py.
"""

from __future__ import annotations

import math

# Bessel 1841
_A = 6377397.155
_F = 1 / 299.1528128
_E2 = _F * (2 - _F)

# WGS84
_WA = 6378137.0
_WF = 1 / 298.257223563
_WE2 = _WF * (2 - _WF)

_LAT0 = math.radians(38.0)
_LON0 = math.radians(127.0028902777778)
_K0 = 1.0
_X0 = 200000.0
_Y0 = 500000.0

_TOWGS84 = (-115.80, 474.99, 674.11, 1.16, -2.31, -1.63, 6.43)  # m, m, m, ″, ″, ″, ppm


def _meridian_arc(phi: float, a: float = _A, e2: float = _E2) -> float:
    e4, e6 = e2 * e2, e2 * e2 * e2
    return a * (
        (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
        - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
        + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi)
        - (35 * e6 / 3072) * math.sin(6 * phi)
    )


_M0 = _meridian_arc(_LAT0)


def tm_forward(lat: float, lng: float) -> tuple[float, float]:
    """Bessel 위경도(도) → TM (x 동, y 북). 시험·역변환 확인용."""
    phi, lam = math.radians(lat), math.radians(lng)
    ep2 = _E2 / (1 - _E2)
    n = _A / math.sqrt(1 - _E2 * math.sin(phi) ** 2)
    t = math.tan(phi) ** 2
    c = ep2 * math.cos(phi) ** 2
    a = (lam - _LON0) * math.cos(phi)
    m = _meridian_arc(phi)
    x = _X0 + _K0 * n * (a + (1 - t + c) * a**3 / 6 + (5 - 18 * t + t * t + 72 * c - 58 * ep2) * a**5 / 120)
    y = _Y0 + _K0 * (
        m - _M0 + n * math.tan(phi) * (a * a / 2 + (5 - t + 9 * c + 4 * c * c) * a**4 / 24 + (61 - 58 * t + t * t + 600 * c - 330 * ep2) * a**6 / 720)
    )
    return x, y


def tm_inverse(x: float, y: float) -> tuple[float, float]:
    """TM (x 동, y 북) → Bessel 위경도(도). Snyder(1987) 식 8-12~8-18."""
    ep2 = _E2 / (1 - _E2)
    m = _M0 + (y - _Y0) / _K0
    mu = m / (_A * (1 - _E2 / 4 - 3 * _E2**2 / 64 - 5 * _E2**3 / 256))
    e1 = (1 - math.sqrt(1 - _E2)) / (1 + math.sqrt(1 - _E2))
    phi1 = (
        mu
        + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
        + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
        + (151 * e1**3 / 96) * math.sin(6 * mu)
        + (1097 * e1**4 / 512) * math.sin(8 * mu)
    )
    sin1, cos1, tan1 = math.sin(phi1), math.cos(phi1), math.tan(phi1)
    c1 = ep2 * cos1**2
    t1 = tan1**2
    n1 = _A / math.sqrt(1 - _E2 * sin1**2)
    r1 = _A * (1 - _E2) / (1 - _E2 * sin1**2) ** 1.5
    d = (x - _X0) / (n1 * _K0)
    phi = phi1 - (n1 * tan1 / r1) * (
        d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d**4 / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d**6 / 720
    )
    lam = _LON0 + (d - (1 + 2 * t1 + c1) * d**3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d**5 / 120) / cos1
    return math.degrees(phi), math.degrees(lam)


def _to_ecef(lat: float, lng: float, a: float, e2: float) -> tuple[float, float, float]:
    phi, lam = math.radians(lat), math.radians(lng)
    n = a / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    return (n * math.cos(phi) * math.cos(lam), n * math.cos(phi) * math.sin(lam), n * (1 - e2) * math.sin(phi))


def _from_ecef(x: float, y: float, z: float, a: float, e2: float) -> tuple[float, float]:
    lam = math.atan2(y, x)
    p = math.hypot(x, y)
    phi = math.atan2(z, p * (1 - e2))
    for _ in range(6):
        n = a / math.sqrt(1 - e2 * math.sin(phi) ** 2)
        phi = math.atan2(z + e2 * n * math.sin(phi), p)
    return math.degrees(phi), math.degrees(lam)


def bessel_to_wgs84(lat: float, lng: float) -> tuple[float, float]:
    """7변수 Helmert(위치 벡터 방식, proj towgs84 와 같은 규약)."""
    tx, ty, tz, rx, ry, rz, s = _TOWGS84
    sec = math.pi / (180 * 3600)
    rx, ry, rz, k = rx * sec, ry * sec, rz * sec, 1 + s * 1e-6
    x, y, z = _to_ecef(lat, lng, _A, _E2)
    x2 = tx + k * (x - rz * y + ry * z)
    y2 = ty + k * (rz * x + y - rx * z)
    z2 = tz + k * (-ry * x + rx * y + z)
    return _from_ecef(x2, y2, z2, _WA, _WE2)


def to_wgs84(x: float, y: float) -> tuple[float, float]:
    """EPSG:5174 (x 동, y 북) → WGS84 (위도, 경도)."""
    return bessel_to_wgs84(*tm_inverse(x, y))
