"""한국관광공사 반려동물 동반여행 서비스(KorPetTourService2) 검증 PoC.

확인 항목(docs/api-analysis.md V-1~V-6):
  V-1 오퍼레이션·파라미터·응답 구조      V-2 제주 지역코드 방식별 건수, 콘텐츠 유형별 건수
  V-3 위치기반 반경 상한·거리순 정렬     V-4 detailPetTour2 필드 목록·채움 비율·빈 응답 형태
  V-5 목록에 있지만 상세가 동반 불가인 사례  V-6 분류 필드(카페 판별 등)

실행: DATA_GO_KR_SERVICE_KEY 환경변수 설정 후
  python poc/kto_pet.py --details 30
예상 호출 수: 약 12 + 제주 목록 페이지 수(100건당 1회) + --details 값 (개발계정 일 1,000건 한도로 보고됨 — 미검증)
"""

from __future__ import annotations

import argparse
import json
import math
import urllib.parse
from collections import Counter
from typing import Any

from common import env_key, http_get, mask, now_iso, save

BASE = "https://apis.data.go.kr/B551011/KorPetTourService2"
JEJU_CITY_HALL = (33.4996, 126.5312)  # (위도, 경도)
CONTENT_TYPES = {"12": "관광지", "14": "문화시설", "28": "레포츠", "32": "숙박", "38": "쇼핑", "39": "음식점"}

calls = 0


def request(op: str, key: str, **params: Any) -> dict[str, Any]:
    """오퍼레이션 1회 호출. 실패해도 원문을 남겨 문서와 실제 응답 차이를 기록한다."""
    global calls
    calls += 1
    # '디코딩' 키는 URL 인코딩이 필요하고 '인코딩' 키는 이미 인코딩돼 있다. 둘 다 받도록 처리.
    encoded_key = key if "%" in key else urllib.parse.quote(key, safe="")
    query = urllib.parse.urlencode({"MobileOS": "ETC", "MobileApp": "PawMapPoC", "_type": "json", **params})
    status, text = http_get(f"{BASE}/{op}?serviceKey={encoded_key}&{query}")
    if status == 0:
        raise SystemExit(f"[중단] {mask(text, key)} — 네트워크·방화벽을 확인하세요.")
    result: dict[str, Any] = {"op": op, "params": params, "http": status, "items": []}
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        result["error"] = "JSON 아님"
        result["raw"] = mask(text[:500], key)
        return result
    resp = data.get("response", data)
    header = resp.get("header", {})
    body = resp.get("body", {})
    result["resultCode"] = header.get("resultCode")
    result["resultMsg"] = header.get("resultMsg")
    result["totalCount"] = body.get("totalCount")
    result["items"] = items_of(body)
    if result["resultCode"] not in (None, "0000"):
        result["raw"] = mask(text[:500], key)
    return result


def items_of(body: dict[str, Any]) -> list[dict[str, Any]]:
    """items 가 "" (빈 문자열) / {"item": {...}} / {"item": [...]} 어느 형태로 와도 목록으로 바꾼다."""
    items = body.get("items")
    if not items or isinstance(items, str):
        return []
    item = items.get("item", [])
    return item if isinstance(item, list) else [item]


def summarize(r: dict[str, Any]) -> str:
    if "error" in r or r.get("resultCode") not in (None, "0000"):
        return f"실패 http={r['http']} code={r.get('resultCode')} msg={r.get('resultMsg')} raw={r.get('raw', '')[:200]}"
    return f"totalCount={r['totalCount']} 받은 항목={len(r['items'])}"


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def fetch_all(key: str, **params: Any) -> list[dict[str, Any]]:
    """areaBasedList2 를 100건씩 끝까지 받는다."""
    items: list[dict[str, Any]] = []
    page = 1
    while True:
        r = request("areaBasedList2", key, numOfRows=100, pageNo=page, **params)
        if r.get("resultCode") not in (None, "0000") or "error" in r:
            print(f"  페이지 {page} {summarize(r)}")
            break
        items += r["items"]
        if not r["items"] or len(items) >= int(r["totalCount"] or 0):
            break
        page += 1
    return items


def stratified(items: list[dict[str, Any]], n: int) -> list[dict[str, Any]]:
    """콘텐츠 유형별로 골고루 n건을 고른다(음식점·숙박 우선)."""
    by_type: dict[str, list[dict[str, Any]]] = {}
    for i in items:
        by_type.setdefault(str(i.get("contenttypeid")), []).append(i)
    order = sorted(by_type, key=lambda t: {"39": 0, "32": 1, "12": 2}.get(t, 3))
    picked: list[dict[str, Any]] = []
    while len(picked) < n and any(by_type.values()):
        for t in order:
            if by_type[t] and len(picked) < n:
                picked.append(by_type[t].pop(0))
    return picked


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--details", type=int, default=30, help="detailPetTour2 를 호출할 샘플 수")
    args = parser.parse_args()
    key = env_key("DATA_GO_KR_SERVICE_KEY")
    lat, lng = JEJU_CITY_HALL
    report: dict[str, Any] = {"runAt": now_iso(), "checks": {}}

    print("== V-2 제주 지역 건수: areaCode=39 vs lDongRegnCd=50")
    for label, params in {"areaCode=39": {"areaCode": "39"}, "lDongRegnCd=50": {"lDongRegnCd": "50"}}.items():
        r = request("areaBasedList2", key, numOfRows=1, pageNo=1, **params)
        print(f"  {label}: {summarize(r)}")
        report["checks"][f"area:{label}"] = {k: v for k, v in r.items() if k != "items"}

    print("== V-1/V-2/V-6 제주 전체 목록(lDongRegnCd=50) 수집")
    items = fetch_all(key, lDongRegnCd="50")
    print(f"  받은 항목 {len(items)}건")
    key_counter: Counter[str] = Counter(k for i in items for k, v in i.items() if v not in (None, ""))
    report["listFieldFillRate"] = {k: f"{c}/{len(items)}" for k, c in key_counter.most_common()}
    print(f"  필드 채움: {report['listFieldFillRate']}")
    for field in ("contenttypeid", "areacode", "cat3", "lclsSystm1", "lclsSystm2", "lclsSystm3", "cpyrhtDivCd"):
        values = Counter(str(i.get(field) or "(빈값)") for i in items)
        report.setdefault("listFieldValues", {})[field] = dict(values.most_common(40))
        print(f"  {field}: {dict(values.most_common(15))}")

    print("== V-3 위치기반 검색 누락 여부: 직접 계산한 거리 vs locationBasedList2(제주시청 기준)")
    dists = [
        haversine_m(lat, lng, float(i["mapy"]), float(i["mapx"]))
        for i in items
        if i.get("mapx") and i.get("mapy")
    ]
    report["noCoordinates"] = len(items) - len(dists)
    for radius in (1000, 3000, 5000, 10000, 20000, 50000):
        r = request("locationBasedList2", key, numOfRows=5, pageNo=1, mapX=lng, mapY=lat, radius=radius, arrange="E")
        expected = sum(1 for d in dists if d <= radius)
        print(f"  radius={radius}: 직접 계산 {expected}건 / API {summarize(r)}")
        report["checks"][f"radius:{radius}"] = {"expected": expected, **{k: v for k, v in r.items() if k != "items"}}

    if items and items[0].get("mapx"):
        probe = items[0]
        r = request("locationBasedList2", key, numOfRows=5, pageNo=1, mapX=probe["mapx"], mapY=probe["mapy"], radius=500, arrange="E")
        hit = any(i.get("contentid") == probe.get("contentid") for i in r["items"])
        print(f"  탐침: '{probe.get('title')}' 좌표 반경 500m → {summarize(r)}, 자기 자신 포함={hit}")
        report["checks"]["probe"] = {"title": probe.get("title"), "found": hit, "totalCount": r.get("totalCount")}

    sample = stratified(items, args.details)
    print(f"== V-4/V-5 detailPetTour2 샘플 {len(sample)}건(유형별 고르게)")
    detail_counter: Counter[str] = Counter()
    empty = 0
    acmpy_types: Counter[str] = Counter()
    examples = []
    for item in sample:
        r = request("detailPetTour2", key, contentId=item.get("contentid"))
        if not r["items"]:
            empty += 1
            continue
        d = r["items"][0]
        detail_counter.update(k for k, v in d.items() if v not in (None, ""))
        acmpy_types[str(d.get("acmpyTypeCd"))] += 1
        examples.append({"title": item.get("title"), "contenttypeid": item.get("contenttypeid"), **d})
    n = len(sample)
    report["detail"] = {
        "sampled": n,
        "emptyResponses": empty,
        "fieldFillRate": {k: f"{c}/{n}" for k, c in detail_counter.most_common()},
        "acmpyTypeCdValues": dict(acmpy_types),
        "examples": examples,
    }
    print(f"  빈 응답 {empty}/{n}, 필드 채움: {report['detail']['fieldFillRate']}")
    print(f"  acmpyTypeCd 값: {dict(acmpy_types)}")
    for e in examples[:6]:
        brief = {k: str(v)[:60] for k, v in e.items() if k.startswith(("acmpy", "etc")) and v}
        print(f"  예시 [{e['contenttypeid']}] {e['title']}: {brief}")

    # google_places.py 가 매칭 검증(V-8, V-10)에 쓰는 입력
    report["listSample"] = [
        {k: i.get(k) for k in ("contentid", "contenttypeid", "title", "addr1", "tel", "mapx", "mapy")}
        # PAW MAP 카테고리 후보(관광지·문화시설·레포츠·숙박·음식점)만. 쇼핑(38) 등은 제외
        for i in stratified([i for i in items if str(i.get("contenttypeid")) in {"12", "14", "28", "32", "39"}], 40)
    ]
    report["callsUsed"] = calls
    path = save("kto_pet", report)
    print(f"\n호출 {calls}회. 결과 저장: {path}")
    print("이 파일은 커밋하지 마세요(이용조건 확인 전). 터미널 출력만 공유하면 됩니다.")


if __name__ == "__main__":
    main()
