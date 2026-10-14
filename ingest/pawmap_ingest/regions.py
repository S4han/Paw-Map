"""전국 17개 시도: 법정동 시도 코드(관광공사 lDongRegnCd 와 같은 체계) · 이름 · 주소 앞부분.

- 강원(51)·전북(52)은 특별자치도 전환 후 코드다. 관광공사가 이 코드로 목록을 주는지는 제주(50) 외에 아직 실측하지 않았다(❓) —
  목록이 0건이면 가공 보고서에 그대로 드러난다.
- 주소 앞부분은 식약처 업소주소·한국문화정보원 시도 명칭을 지역별로 나누는 데 쓴다. 옛 이름(전라북도·강원도)도 함께 받는다.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Sido:
    code: str
    name: str
    prefixes: tuple[str, ...]


SIDOS: tuple[Sido, ...] = (
    Sido("11", "서울", ("서울",)),
    Sido("26", "부산", ("부산",)),
    Sido("27", "대구", ("대구",)),
    Sido("28", "인천", ("인천",)),
    Sido("29", "광주", ("광주",)),
    Sido("30", "대전", ("대전",)),
    Sido("31", "울산", ("울산",)),
    Sido("36", "세종", ("세종",)),
    Sido("41", "경기", ("경기",)),
    Sido("43", "충북", ("충청북도", "충북")),
    Sido("44", "충남", ("충청남도", "충남")),
    Sido("46", "전남", ("전라남도", "전남")),
    Sido("47", "경북", ("경상북도", "경북")),
    Sido("48", "경남", ("경상남도", "경남")),
    Sido("50", "제주", ("제주",)),
    Sido("51", "강원", ("강원",)),
    Sido("52", "전북", ("전북", "전라북도")),
)
BY_CODE = {s.code: s for s in SIDOS}
ALL_CODES = tuple(s.code for s in SIDOS)


def sido(code: str) -> Sido:
    try:
        return BY_CODE[code]
    except KeyError:
        raise ValueError(f"알 수 없는 시도 코드: {code} (사용 가능: {', '.join(ALL_CODES)})") from None


def parse_region_arg(value: str) -> list[str]:
    """'50' / '11,26,50' / 'all' → 시도 코드 목록(입력 순서 유지, 중복 제거)."""
    if value.strip().lower() == "all":
        return list(ALL_CODES)
    codes = list(dict.fromkeys(c.strip() for c in value.split(",") if c.strip()))
    for c in codes:
        sido(c)
    return codes
