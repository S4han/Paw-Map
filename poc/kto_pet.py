"""한국관광공사 반려동물 동반여행 서비스(KorPetTourService2) 검증 PoC.

확인 항목(docs/api-analysis.md V-1~V-6):
  V-1 오퍼레이션·파라미터·응답 구조      V-2 제주 지역코드 방식별 건수, 콘텐츠 유형별 건수
  V-3 위치기반 반경 상한·거리순 정렬     V-4 detailPetTour2 필드 목록·채움 비율·빈 응답 형태
  V-5 목록에 있지만 상세가 동반 불가인 사례  V-6 분류 필드(카페 판별 등)

실행: DATA_GO_KR_SERVICE_KEY 환경변수 설정 후
  python poc/kto_pet.py --details 30
예상 호출 수: 약 15 + --details 값 (개발계정 일 1,000건 한도로 보고됨 — 미검증)
"""

from __future__ import annotations

import argparse
import json
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
        if r["items"]:
            report["checks"][f"area:{label}"]["itemKeys"] = sorted(r["items"][0].keys())

    print("== V-2 콘텐츠 유형별 건수(areaCode=39)")
    for type_id, name in CONTENT_TYPES.items():
        r = request("areaBasedList2", key, numOfRows=1, pageNo=1, areaCode="39", contentTypeId=type_id)
        print(f"  {type_id} {name}: {summarize(r)}")
        report["checks"][f"type:{type_id}"] = {k: v for k, v in r.items() if k != "items"}

    print("== V-3 위치기반 반경(제주시청 기준, 거리순 arrange=E)")
    for radius in (1000, 3000, 5000, 10000, 20000, 50000):
        r = request("locationBasedList2", key, numOfRows=5, pageNo=1, mapX=lng, mapY=lat, radius=radius, arrange="E")
        print(f"  radius={radius}: {summarize(r)}")
        entry = {k: v for k, v in r.items() if k != "items"}
        entry["first"] = [{k: i.get(k) for k in ("title", "contenttypeid", "dist")} for i in r["items"]]
        report["checks"][f"radius:{radius}"] = entry

    print("== V-1/V-6 목록 샘플 필드(위치기반 10km, 100건)")
    sample = request("locationBasedList2", key, numOfRows=100, pageNo=1, mapX=lng, mapY=lat, radius=10000, arrange="E")
    print(f"  {summarize(sample)}")
    items = sample["items"]
    key_counter: Counter[str] = Counter(k for i in items for k, v in i.items() if v not in (None, ""))
    report["listFieldFillRate"] = {k: f"{c}/{len(items)}" for k, c in key_counter.most_common()}
    for field in ("contenttypeid", "cat1", "cat2", "cat3", "lclsSystm1", "lclsSystm2", "lclsSystm3", "cpyrhtDivCd"):
        values = Counter(str(i.get(field)) for i in items if i.get(field) not in (None, ""))
        if values:
            report.setdefault("listFieldValues", {})[field] = dict(values.most_common(30))
    print(f"  필드 채움: {report['listFieldFillRate']}")
    # google_places.py 가 매칭 검증(V-8, V-10)에 쓰는 입력
    report["listSample"] = [
        {k: i.get(k) for k in ("contentid", "contenttypeid", "title", "addr1", "tel", "mapx", "mapy")} for i in items
    ]

    print(f"== V-4/V-5 detailPetTour2 샘플 {args.details}건")
    detail_counter: Counter[str] = Counter()
    empty = 0
    acmpy_types: Counter[str] = Counter()
    examples = []
    for item in items[: args.details]:
        r = request("detailPetTour2", key, contentId=item.get("contentid"))
        if not r["items"]:
            empty += 1
            continue
        d = r["items"][0]
        detail_counter.update(k for k, v in d.items() if v not in (None, ""))
        acmpy_types[str(d.get("acmpyTypeCd"))] += 1
        if len(examples) < 10:
            examples.append({"title": item.get("title"), "contenttypeid": item.get("contenttypeid"), **d})
    n = min(args.details, len(items))
    report["detail"] = {
        "sampled": n,
        "emptyResponses": empty,
        "fieldFillRate": {k: f"{c}/{n}" for k, c in detail_counter.most_common()},
        "acmpyTypeCdValues": dict(acmpy_types),
        "examples": examples,
    }
    print(f"  빈 응답 {empty}/{n}, 필드 채움: {report['detail']['fieldFillRate']}")
    print(f"  acmpyTypeCd 값: {dict(acmpy_types)}")

    report["callsUsed"] = calls
    path = save("kto_pet", report)
    print(f"\n호출 {calls}회. 결과 저장: {path}")
    print("이 파일은 커밋하지 마세요(이용조건 확인 전). 요약만 공유하면 됩니다.")


if __name__ == "__main__":
    main()
