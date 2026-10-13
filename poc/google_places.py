"""Google Places API (New) 검증 PoC — allowsDogs 한국 채움 비율(V-8)과 관광공사 장소 매칭 정확도(V-10).

방식(장소 1곳당):
  1) Text Search, 필드마스크 `places.id` 만 → Text Search Essentials (IDs Only) SKU (문서상 무료·무제한 — 미검증)
  2) Place Details, 필드마스크 `displayName,formattedAddress,location,nationalPhoneNumber,allowsDogs`
     → allowsDogs 때문에 Place Details Enterprise + Atmosphere SKU 로 과금 (문서상 월 무료 1,000건 — 미검증)

입력: kto_pet.py 결과 파일(poc/out/kto_pet-*.json)의 listSample
실행: GOOGLE_PLACES_API_KEY 환경변수 설정 후
  python poc/google_places.py poc/out/kto_pet-XXXX.json --limit 20
유료 등급 호출 전 예상 사용량을 보여주고 확인(y)을 받는다. 실행 전 Cloud 콘솔에서 일일 쿼터 상한을 걸어두세요.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from pathlib import Path
from typing import Any

from common import env_key, http_get, http_post_json, mask, now_iso, save

TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"
DETAIL_FIELDS = "displayName,formattedAddress,location,nationalPhoneNumber,allowsDogs"


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def digits(phone: str | None) -> str:
    return "".join(c for c in (phone or "") if c.isdigit())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("kto_result", type=Path)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--yes", action="store_true", help="확인 질문 없이 실행")
    args = parser.parse_args()

    sample = json.loads(args.kto_result.read_text(encoding="utf-8")).get("listSample", [])[: args.limit]
    if not sample:
        raise SystemExit("listSample 이 비어 있습니다. kto_pet.py 를 먼저 실행하세요.")
    key = env_key("GOOGLE_PLACES_API_KEY")

    print(f"대상 {len(sample)}곳. 예상 사용량: Text Search IDs Only {len(sample)}건, "
          f"Place Details Enterprise+Atmosphere 최대 {len(sample)}건")
    if not args.yes and input("진행할까요? [y/N] ").strip().lower() != "y":
        raise SystemExit("취소했습니다.")

    headers = {"X-Goog-Api-Key": key}
    rows: list[dict[str, Any]] = []
    usage: Counter[str] = Counter()
    for place in sample:
        lat, lng = float(place["mapy"]), float(place["mapx"])
        status, text = http_post_json(
            TEXT_SEARCH_URL,
            {
                "textQuery": place["title"],
                "languageCode": "ko",
                "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 500.0}},
                "pageSize": 1,
            },
            {**headers, "X-Goog-FieldMask": "places.id"},
        )
        usage["TextSearch_IDsOnly"] += 1
        row: dict[str, Any] = {"title": place["title"], "contenttypeid": place.get("contenttypeid")}
        if status == 0:
            raise SystemExit(f"[중단] {text} — 네트워크·방화벽을 확인하세요.")
        if status != 200:
            row["error"] = f"textSearch http={status} {mask(text[:200], key)}"
            rows.append(row)
            continue
        found = json.loads(text).get("places", [])
        if not found:
            row["match"] = "검색 결과 없음"
            rows.append(row)
            continue

        place_id = found[0]["id"]
        status, text = http_get(
            DETAILS_URL.format(place_id=place_id) + "?languageCode=ko",
            {**headers, "X-Goog-FieldMask": DETAIL_FIELDS},
        )
        usage["PlaceDetails_EnterpriseAtmosphere"] += 1
        if status != 200:
            row["error"] = f"details http={status} {mask(text[:200], key)}"
            rows.append(row)
            continue
        d = json.loads(text)
        loc = d.get("location", {})
        dist = haversine_m(lat, lng, loc.get("latitude", 0), loc.get("longitude", 0)) if loc else None
        phone_match = bool(digits(place.get("tel"))) and digits(place.get("tel"))[-8:] == digits(d.get("nationalPhoneNumber"))[-8:]
        row.update(
            {
                "googleName": d.get("displayName", {}).get("text"),
                "distanceM": round(dist) if dist is not None else None,
                "phoneMatch": phone_match,
                # 필드가 아예 없으면 None(=Google에 정보 없음). False 와 구분해서 기록한다.
                "allowsDogs": d.get("allowsDogs"),
                "match": "가능성 높음" if dist is not None and dist <= 50 and phone_match else "수동 확인 필요",
            }
        )
        rows.append(row)

    allows = Counter(str(r.get("allowsDogs")) for r in rows if "googleName" in r)
    report = {
        "runAt": now_iso(),
        "usage": dict(usage),
        "allowsDogsValues": dict(allows),  # 'True' / 'False' / 'None'(정보 없음)
        "matchSummary": dict(Counter(r.get("match", "오류") for r in rows)),
        "rows": rows,
    }
    path = save("google_places", report)
    print(f"allowsDogs 값 분포: {dict(allows)}  (None = 정보 없음)")
    print(f"매칭: {report['matchSummary']}  사용량: {dict(usage)}")
    print(f"결과 저장: {path} — Google 콘텐츠이므로 커밋하지 마세요.")


if __name__ == "__main__":
    main()
