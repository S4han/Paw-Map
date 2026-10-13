"""이름·주소·전화번호 정규화(중복 판정, 식약처 자체 키, 지오코딩 입력)."""

from __future__ import annotations

import hashlib
import re

# 이름 비교용: 공백·괄호 내용·기호를 없애고 소문자로
_PAREN = re.compile(r"\([^)]*\)|\[[^\]]*\]")
_NON_WORD = re.compile(r"[^0-9a-z가-힣]")


def norm_name(name: str) -> str:
    return _NON_WORD.sub("", _PAREN.sub("", name.lower()))


# 식약처 주소: "서울특별시 마포구 성미산로29길 17-8(1,2,지1층" 처럼 닫히지 않은 괄호·층 정보가 섞여 있음(실측)
_FLOOR = re.compile(r"\s*(지하\s*)?\d+(\s*~\s*\d+)?\s*층.*$")


def clean_address(addr: str) -> str:
    a = addr.strip()
    for sep in ("(", ","):  # 첫 괄호·쉼표 이후는 상세 위치(층·호수·건물명)
        if sep in a:
            a = a[: a.index(sep)]
    a = _FLOOR.sub("", a)
    return re.sub(r"\s+", " ", a).strip()


def norm_address(addr: str) -> str:
    return re.sub(r"\s+", "", clean_address(addr))


def norm_phone(phone: str | None) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-8:] if len(digits) >= 8 else ""


def stable_key(*parts: str) -> str:
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:12]
