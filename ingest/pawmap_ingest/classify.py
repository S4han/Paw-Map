"""출처 분류 → PAW MAP 카테고리(아키텍처 §6.1·§6.2).

관광공사 신분류(lclsSystm) 코드표 원문은 아직 대조하지 못했다(api-analysis V-6). 그래서 카페 판별은
이름 키워드로 보정하고, 판별 결과 분포를 가공 보고서에 남겨 사람이 점검한다.
"""

from __future__ import annotations

import re

from .models import Category

_CAFE_NAME = re.compile(r"카페|커피|coffee|cafe|café|베이커리|bakery|디저트|티하우스|찻집", re.IGNORECASE)

# 관광공사 contentTypeId → 카테고리. 38(쇼핑)·15(행사)·25(여행코스) 등은 대상 아님(None)
_KTO_TYPES: dict[str, Category] = {"12": "ATTRACTION", "14": "ATTRACTION", "28": "ATTRACTION", "32": "STAY", "39": "RESTAURANT"}


def kto_category(content_type_id: str, title: str) -> Category | None:
    cat = _KTO_TYPES.get(str(content_type_id))
    if cat == "RESTAURANT" and _CAFE_NAME.search(title):
        return "CAFE"
    return cat


def mfds_category(business_type: str, name: str) -> Category:
    """식약처 업종: 일반음식점 / 휴게음식점 / 제과점영업(실측 3종)."""
    if "휴게" in business_type or "제과" in business_type or _CAFE_NAME.search(name):
        return "CAFE"
    return "RESTAURANT"


# 실내 공간이 있는 업소(D-7: 전구역 동반가능 → 실내 가능으로 보는 대상)
def has_indoor_space(category: Category, content_type_id: str | None = None) -> bool:
    return category in ("RESTAURANT", "CAFE", "STAY") or str(content_type_id) == "14"
