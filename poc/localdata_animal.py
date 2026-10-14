"""행정안전부 지방행정 인허가 데이터(공공데이터포털, 옛 LOCALDATA) 실측 — 동물병원·동물약국 등.

LOCALDATA 는 2026-04-16 종료, 공공데이터포털로 이관(🔷 행정안전부 보도). 요청 주소·변수·응답 필드를
검색으로는 확인하지 못해서(❓) 이 스크립트로 실제 응답을 보고 결정한다. 표준 라이브러리만 사용.

사용(저장소 루트, 키는 환경변수로만):
    python3 poc/localdata_animal.py "<요청주소>"                 # 공공데이터포털 상세 페이지의 요청주소(End Point + 오퍼레이션)
    python3 poc/localdata_animal.py "<요청주소>" --rows 100 --geocode 10

출력: 응답 구조, 전체 건수, 항목 이름별 채움 비율·대표 값, 영업상태 값 분포, 좌표 열 추정과
EPSG:5174 → WGS84 변환 결과를 카카오 주소 검색 좌표와 비교한 거리(--geocode, KAKAO_REST_API_KEY 필요).
원본 응답은 poc/out/ 에 저장(커밋되지 않음). 터미널 요약만 공유해 주세요.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import urllib.parse
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent / "ingest"))
from common import env_key, http_get, mask, now_iso, save  # noqa: E402
from pawmap_ingest.epsg5174 import to_wgs84  # noqa: E402

STATUS_HINT = re.compile(r"(상태|stts|stat|state|sttus)", re.I)
X_HINT = re.compile(r"(^x$|crdntx|crd_x|좌표.*x|_x$|xcrd|xcode)", re.I)
Y_HINT = re.compile(r"(^y$|crdnty|crd_y|좌표.*y|_y$|ycrd|ycode)", re.I)
ADDR_HINT = re.compile(r"(도로명|소재지|addr|adr|주소)", re.I)
NAME_HINT = re.compile(r"(사업장명|bplcnm|bplc_nm|상호|name|nm$)", re.I)


def find_items(node: Any, path: str = "") -> tuple[str, list[dict]] | None:
    """응답 안에서 dict 목록을 처음 찾는다(구조를 모르므로)."""
    if isinstance(node, list) and node and all(isinstance(x, dict) for x in node):
        return path, node
    if isinstance(node, dict):
        for k, v in node.items():
            hit = find_items(v, f"{path}.{k}" if path else k)
            if hit:
                return hit
        # item 이 하나면 dict 로 오는 API 가 있다
        if "item" in node and isinstance(node["item"], dict):
            return f"{path}.item", [node["item"]]
    return None


def find_number(node: Any, names: tuple[str, ...]) -> Any:
    if isinstance(node, dict):
        for k, v in node.items():
            if k in names:
                return v
            hit = find_number(v, names)
            if hit is not None:
                return hit
    return None


def shape(node: Any, depth: int = 0) -> str:
    pad = "  " * depth
    if isinstance(node, dict):
        lines = []
        for k, v in node.items():
            if isinstance(v, (dict, list)):
                lines.append(f"{pad}{k}:")
                lines.append(shape(v, depth + 1))
            else:
                lines.append(f"{pad}{k}: {str(v)[:40]!r}")
        return "\n".join(lines)
    if isinstance(node, list):
        return f"{pad}[목록 {len(node)}개]" + ("\n" + shape(node[0], depth + 1) if node and isinstance(node[0], dict) and depth < 2 else "")
    return f"{pad}{str(node)[:40]!r}"


def fnum(v: Any) -> float | None:
    try:
        f = float(str(v).strip())
        return f if math.isfinite(f) and f != 0 else None
    except ValueError:
        return None


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("url", help="요청주소(예: https://apis.data.go.kr/…/…). 물음표 뒤 변수는 빼고 넣어도 됨")
    ap.add_argument("--rows", type=int, default=100)
    ap.add_argument("--page", type=int, default=1)
    ap.add_argument("--geocode", type=int, default=0, help="카카오 주소 검색으로 비교할 건수(0이면 안 함)")
    ap.add_argument("--param", action="append", default=[], help="추가 변수 이름=값(여러 번 가능)")
    args = ap.parse_args()

    key = env_key("DATA_GO_KR_SERVICE_KEY")
    enc_key = key if "%" in key else urllib.parse.quote(key, safe="")
    base = args.url.split("?")[0]
    extra = dict(p.split("=", 1) for p in args.param)
    # 포털 API 마다 응답 형식 변수 이름이 달라서 흔한 것을 함께 보낸다(모르는 변수는 보통 무시됨)
    params = {"pageNo": args.page, "numOfRows": args.rows, "type": "json", "_type": "json", "resultType": "json", "returnType": "json", **extra}
    url = f"{base}?serviceKey={enc_key}&{urllib.parse.urlencode(params)}"
    status, body = http_get(url, timeout=30)
    print(f"# 요청: {mask(base, key)}  변수: {params}")
    print(f"HTTP {status}, 응답 {len(body)}자")
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        print("JSON 아님 — 앞부분:")
        print(mask(body[:800], key))
        return 1
    saved = save("localdata_animal", {"fetchedAt": now_iso(), "endpoint": base, "params": params, "response": data})

    print("\n## 응답 구조")
    print(shape(data))
    total = find_number(data, ("totalCount", "total_count", "list_total_count", "totCnt", "totalCnt"))
    code = find_number(data, ("resultCode", "result_code", "CODE", "code"))
    msg = find_number(data, ("resultMsg", "result_msg", "MESSAGE", "message"))
    print(f"\n결과 코드: {code} {msg}   전체 건수: {total}")

    hit = find_items(data)
    if not hit:
        print("항목 목록을 찾지 못함 — 위 구조를 공유해 주세요")
        return 1
    path, items = hit
    print(f"항목 위치: {path} ({len(items)}건)")

    print("\n## 항목 이름별 채움 비율·대표 값")
    keys: list[str] = []
    for it in items:
        keys += [k for k in it if k not in keys]
    for k in keys:
        vals = [str(it.get(k) or "").strip() for it in items]
        filled = [v for v in vals if v]
        sample = Counter(filled).most_common(3)
        print(f"- {k}: {len(filled)}/{len(items)}  예: {[s[:24] for s, _ in sample]}")

    print("\n## 영업상태로 보이는 항목의 값 분포")
    for k in keys:
        if STATUS_HINT.search(k):
            print(f"- {k}: {dict(Counter(str(it.get(k) or '(빈 값)') for it in items).most_common(10))}")

    xk = next((k for k in keys if X_HINT.search(k)), None)
    yk = next((k for k in keys if Y_HINT.search(k)), None)
    ak = [k for k in keys if ADDR_HINT.search(k)]
    nk = next((k for k in keys if NAME_HINT.search(k)), None)
    print(f"\n## 좌표: x={xk}, y={yk}  주소 항목: {ak}  이름 항목: {nk}")
    if not (xk and yk):
        print("좌표 항목을 찾지 못함 — 위 항목 이름을 공유해 주세요")
        print(f"\n원본 저장: {saved}")
        return 0
    with_xy = [it for it in items if fnum(it.get(xk)) and fnum(it.get(yk))]
    print(f"좌표 있음 {len(with_xy)}/{len(items)}")
    for it in with_xy[:3]:
        x, y = fnum(it.get(xk)), fnum(it.get(yk))
        assert x and y
        lat, lng = to_wgs84(x, y)
        print(f"- ({x}, {y}) → ({lat:.6f}, {lng:.6f})  {str(it.get(ak[0]) if ak else '')[:30]}")

    if args.geocode:
        from pawmap_ingest.geocode import make_kakao_lookup

        lookup = make_kakao_lookup(env_key("KAKAO_REST_API_KEY"))
        dists: list[float] = []
        print(f"\n## 변환 좌표 vs 카카오 주소 검색(최대 {args.geocode}건)")
        for it in with_xy[: args.geocode]:
            addr = next((str(it.get(k)).strip() for k in ak if str(it.get(k) or "").strip()), "")
            if not addr:
                continue
            docs = lookup("https://dapi.kakao.com/v2/local/search/address.json", addr)
            if not docs:
                print(f"- 주소 검색 결과 없음: {addr[:30]}")
                continue
            x, y = fnum(it.get(xk)), fnum(it.get(yk))
            assert x and y
            d = haversine(to_wgs84(x, y), (float(docs[0]["y"]), float(docs[0]["x"])))
            dists.append(d)
            print(f"- {d:7.1f}m  {addr[:30]}")
        if dists:
            dists.sort()
            print(f"거리 중앙값 {dists[len(dists) // 2]:.1f}m, 최대 {dists[-1]:.1f}m (수십 m 이내면 변환이 맞다)")

    print(f"\n원본 저장: {saved}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
