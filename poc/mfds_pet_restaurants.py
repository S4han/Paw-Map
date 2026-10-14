"""식약처 '반려동물 동반 가능 업소 현황' 파일 분석 PoC (V-13~V-15).

이 자료는 API가 아니라 식품안전나라(https://www.foodsafetykorea.go.kr/portal/petKorea.do)에서
Excel/PDF로 내려받는 파일로 확인됨(검색 기준, 2026-10-13). 파일을 직접 받아 아래처럼 실행한다.

  python poc/mfds_pet_restaurants.py 다운로드한파일.xlsx      # openpyxl 필요: pip install openpyxl
  python poc/mfds_pet_restaurants.py 다운로드한파일.csv       # Excel에서 'CSV UTF-8'로 저장하면 추가 설치 불필요

확인 항목: 열 구성(식별자·좌표 유무), 전체·제주 건수, 업종 분포(카페 판별 가능 여부), 날짜 열(확인일 근거 가능 여부)
"""

from __future__ import annotations

import csv
import sys
from collections import Counter
from pathlib import Path

from common import now_iso, save


def read_rows(path: Path) -> list[list[str]]:
    if path.suffix.lower() == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as f:
            return [row for row in csv.reader(f)]
    try:
        import openpyxl  # type: ignore[import-not-found]
    except ImportError:
        sys.exit("xlsx 를 읽으려면 'pip install openpyxl' 이 필요합니다. 또는 Excel에서 CSV UTF-8로 저장해 주세요.")
    # read_only 모드는 파일에 기록된 시트 크기(dimension)만 믿는데, 식품안전나라 파일은 이 값이 'A1'로
    # 잘못 들어 있는 것으로 보인다(2026-10-13, read_only로 읽으면 '연번' 한 칸만 나옴). 일반 모드로 읽고, 시트가 여러 개면 가장 큰 시트를 쓴다.
    wb = openpyxl.load_workbook(path, data_only=True)
    sheets = {
        ws.title: [["" if c is None else str(c) for c in row] for row in ws.iter_rows(values_only=True)]
        for ws in wb.worksheets
    }
    print(f"시트: { {name: len(rows) for name, rows in sheets.items()} }")
    return max(sheets.values(), key=len)


def find_header(rows: list[list[str]]) -> int:
    """제목 줄이 위에 붙어 있는 엑셀이 많아, 값이 가장 많이 찬 앞쪽 줄을 머리글로 본다."""
    best, best_count = 0, -1
    for i, row in enumerate(rows[:15]):
        count = sum(1 for c in row if c.strip())
        if count > best_count:
            best, best_count = i, count
    return best


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    rows = read_rows(Path(sys.argv[1]))
    h = find_header(rows)
    header = [c.strip() for c in rows[h]]
    data = [r for r in rows[h + 1 :] if any(c.strip() for c in r)]
    print(f"머리글({h + 1}번째 줄): {header}")
    print(f"데이터 {len(data)}행")
    for r in data[:3]:  # 공개된 업소 목록이라 앞 3행만 구조 확인용으로 출력
        print(f"  예시: {[c[:30] for c in r]}")

    def col(*names: str) -> int | None:
        for i, name in enumerate(header):
            if any(n in name for n in names):
                return i
        return None

    addr_i = col("소재지", "주소")
    type_i = col("업종", "업태")
    report = {
        "runAt": now_iso(),
        "file": Path(sys.argv[1]).name,
        "header": header,
        "rows": len(data),
        "hasCoordinates": any(k in "".join(header) for k in ("위도", "경도", "좌표", "X", "Y")),
        "dateColumns": [c for c in header if any(k in c for k in ("일자", "날짜", "등록일", "지정일"))],
        "idColumns": [c for c in header if any(k in c for k in ("번호", "인허가", "관리"))],
    }
    if addr_i is not None:
        report["jejuRows"] = sum(1 for r in data if len(r) > addr_i and "제주" in r[addr_i])
        report["bySido"] = dict(Counter(r[addr_i].split()[0] for r in data if len(r) > addr_i and r[addr_i].split()).most_common())
    if type_i is not None:
        report["byType"] = dict(Counter(r[type_i] for r in data if len(r) > type_i).most_common())
    for k, v in report.items():
        if k != "runAt":
            print(f"{k}: {v}")
    print(f"결과 저장: {save('mfds_pet_restaurants', report)}")


if __name__ == "__main__":
    main()
