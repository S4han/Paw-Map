"""한국문화정보원 '전국 반려동물 동반 가능 문화시설 위치 데이터'(공공데이터포털 15111389) 실측.

데이터 확충(세 번째 출처) 검토용 일회성 스크립트. 표준 라이브러리만 사용한다.
열 이름을 미리 알지 못하므로(검색 요약만 있음 🔷) 머리글에서 키워드로 찾고, 집계만 출력한다.

사용(저장소 루트):
    python3 poc/kcisa_pet_facilities.py ingest/input/받은파일.csv
    python3 poc/kcisa_pet_facilities.py ingest/input/받은파일.csv --region 제주 --live frontend/public/data/live/places.50.json

출력: 머리글, 전체·지역 건수, 분류별 건수, 반려동물 관련 열의 채움 비율과 대표 값, 최종작성일 분포,
현재 데이터셋(관광공사+식약처)과 겹치는 정도. 요약 JSON 은 poc/out/ 에 저장(커밋되지 않음).
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import now_iso, save  # noqa: E402

ENCODINGS = ("utf-8-sig", "cp949", "euc-kr")


def read_rows(path: Path) -> tuple[list[str], list[dict[str, str]], str]:
    raw = path.read_bytes()
    for enc in ENCODINGS:
        try:
            text = raw.decode(enc)
        except UnicodeDecodeError:
            continue
        reader = csv.DictReader(io.StringIO(text))
        rows = [{k.strip(): (v or "").strip() for k, v in r.items() if k} for r in reader]
        return [h.strip() for h in (reader.fieldnames or [])], rows, enc
    sys.exit(f"[중단] 인코딩을 알 수 없습니다({', '.join(ENCODINGS)} 실패)")


def find(headers: list[str], *keywords: str) -> str | None:
    for h in headers:
        if all(k in h for k in keywords):
            return h
    return None


def to_float(s: str) -> float | None:
    try:
        v = float(s)
    except ValueError:
        return None
    return v if math.isfinite(v) and v != 0 else None


def dist_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


_PAREN = re.compile(r"\([^)]*\)|\[[^\]]*\]")
_NON_WORD = re.compile(r"[^0-9a-z가-힣]")


def norm_name(s: str) -> str:  # ingest/pawmap_ingest/normalize.py 와 같은 규칙
    return _NON_WORD.sub("", _PAREN.sub("", s.lower()))


def norm_phone(s: str) -> str:
    d = re.sub(r"\D", "", s or "")
    return d[-8:] if len(d) >= 8 else ""


def top(counter: Counter[str], n: int) -> list[list[object]]:
    return [[k, v] for k, v in counter.most_common(n)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", type=Path)
    ap.add_argument("--region", default="제주", help="시도 이름에 포함된 글자(기본: 제주)")
    ap.add_argument("--live", type=Path, default=Path("frontend/public/data/live/places.50.json"))
    args = ap.parse_args()

    headers, rows, enc = read_rows(args.csv)
    print(f"인코딩 {enc} · 전체 {len(rows)}행 · 열 {len(headers)}개")
    print("머리글:", " | ".join(headers))

    col = {
        "sido": find(headers, "시도"),
        "name": find(headers, "시설명") or find(headers, "명칭"),
        "lat": find(headers, "위도"),
        "lng": find(headers, "경도"),
        "phone": find(headers, "전화"),
        "road": find(headers, "도로명주소") or find(headers, "도로명"),
        "updated": find(headers, "최종작성일") or find(headers, "작성일"),
    }
    category_cols = [h for h in headers if "카테고리" in h or "분류" in h]
    pet_cols = [h for h in headers if any(k in h for k in ("반려", "동반", "제한", "크기", "실내", "실외", "추가 요금", "추가요금"))]
    print("찾은 열:", json.dumps(col, ensure_ascii=False))
    print("분류 열:", category_cols, "· 반려동물 관련 열:", pet_cols)

    region = [r for r in rows if col["sido"] and args.region in r.get(col["sido"], "")]
    print(f"\n[{args.region}] {len(region)}행")

    summary: dict[str, object] = {
        "checkedAt": now_iso(),
        "file": args.csv.name,
        "encoding": enc,
        "rows": len(rows),
        "headers": headers,
        "columns": col,
        "regionRows": len(region),
        "sidoTop": top(Counter(r.get(col["sido"] or "", "") for r in rows), 20),
    }

    cats = {}
    for c in category_cols:
        cnt = Counter(r.get(c, "") for r in region)
        cats[c] = top(cnt, 25)
        print(f"\n분류 '{c}' (상위):")
        for k, v in cnt.most_common(25):
            print(f"  {k or '(빈 값)'}: {v}")
    summary["categories"] = cats

    pets = {}
    for c in pet_cols:
        vals = [r.get(c, "") for r in region]
        filled = [v for v in vals if v and v != "-"]  # "N"·"없음"도 값이 있는 것으로 센다(정보 없음과 구분)
        cnt = Counter(vals)
        pets[c] = {"filled": len(filled), "of": len(vals), "top": top(cnt, 12)}
        print(f"\n'{c}': 채움 {len(filled)}/{len(vals)}")
        for k, v in cnt.most_common(12):
            print(f"  {k[:60] or '(빈 값)'}: {v}")
    summary["petColumns"] = pets

    if col["updated"]:
        years = Counter((r.get(col["updated"], "")[:4] or "(없음)") for r in region)
        summary["updatedYears"] = top(years, 20)
        print("\n최종작성일(연도):", ", ".join(f"{k} {v}" for k, v in sorted(years.items())))

    coords = [(r, to_float(r.get(col["lat"] or "", "")), to_float(r.get(col["lng"] or "", ""))) for r in region]
    with_xy = [(r, la, lo) for r, la, lo in coords if la is not None and lo is not None]
    summary["regionWithCoords"] = len(with_xy)
    print(f"\n좌표 있음 {len(with_xy)}/{len(region)}")

    if args.live.exists():
        live = json.loads(args.live.read_text(encoding="utf-8"))["places"]
        near = same = 0
        for r, la, lo in with_xy:
            nm, ph = norm_name(r.get(col["name"] or "", "")), norm_phone(r.get(col["phone"] or "", ""))
            cands = [p for p in live if dist_m(la, lo, p["latitude"], p["longitude"]) <= 50]
            if cands:
                near += 1
                if any(norm_name(p["name"]) == nm or (ph and norm_phone(p.get("phone", "")) == ph) for p in cands):
                    same += 1
        summary["overlap"] = {"live": len(live), "within50m": near, "sameNameOrPhone": same}
        print(f"현재 데이터셋 {len(live)}곳과 비교: 50m 안에 기존 장소 있음 {near}, 그중 이름·전화 일치 {same} → 새로 늘어날 후보 약 {len(with_xy) - same}")
    else:
        print(f"(비교 생략: {args.live} 없음 — 실데이터 가공 후 다시 실행하면 겹침도 계산)")

    path = save("kcisa_pet_facilities", summary)
    print(f"\n요약 저장: {path} (커밋되지 않음). 위 터미널 출력만 공유해 주세요.")


if __name__ == "__main__":
    main()
