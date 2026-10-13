"""카카오 로컬 REST API로 주소 → 좌표(가공 단계 전용, 아키텍처 §6.2).

결과는 로컬 캐시(ingest/cache/geocode.json, 커밋하지 않음)에 두어 다시 실행할 때 호출하지 않는다.
"""

from __future__ import annotations

import json
import urllib.parse
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"


@dataclass
class GeoResult:
    lat: float
    lng: float
    method: str  # "address" | "keyword"
    matched: str  # 카카오가 돌려준 주소(보고서 점검용)


Lookup = Callable[[str, str], list[dict]]  # (url, query) → documents


def make_kakao_lookup(rest_key: str) -> Lookup:
    from .http import get_json

    def lookup(url: str, query: str) -> list[dict]:
        resp = get_json(f"{url}?{urllib.parse.urlencode({'query': query, 'size': 1})}", {"Authorization": f"KakaoAK {rest_key}"}, secret=rest_key)
        return list(resp.get("documents") or [])

    return lookup


def _region_prefix(address: str) -> str:
    """'제주특별자치도 제주시 연동 …' → '제주특별자치도 제주시' (키워드 검색 결과 검증용)."""
    return " ".join(address.split()[:2])


class Geocoder:
    def __init__(self, lookup: Lookup, cache_path: Path):
        self.lookup = lookup
        self.cache_path = cache_path
        self.cache: dict[str, dict] = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
        self.calls = 0

    def save(self) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps(self.cache, ensure_ascii=False, indent=0), encoding="utf-8")

    def geocode(self, address: str, name: str) -> GeoResult | None:
        key = f"{address}|{name}"
        if key in self.cache:
            c = self.cache[key]
            return GeoResult(**c) if c else None
        result = self._lookup_address(address) or self._lookup_keyword(address, name)
        self.cache[key] = result.__dict__ if result else {}
        return result

    def _lookup_address(self, address: str) -> GeoResult | None:
        if not address:
            return None
        self.calls += 1
        docs = self.lookup(ADDRESS_URL, address)
        if not docs:
            return None
        d = docs[0]
        return GeoResult(float(d["y"]), float(d["x"]), "address", d.get("address_name", ""))

    def _lookup_keyword(self, address: str, name: str) -> GeoResult | None:
        prefix = _region_prefix(address)
        if not name or not prefix:
            return None
        self.calls += 1
        docs = self.lookup(KEYWORD_URL, f"{prefix} {name}")
        if not docs:
            return None
        d = docs[0]
        found = d.get("road_address_name") or d.get("address_name") or ""
        # 다른 지역의 같은 이름 업소를 잘못 고르지 않도록 시·군 접두가 같을 때만 채택
        if not found.startswith(prefix.split()[0][:2]) or prefix.split()[-1] not in found:
            return None
        return GeoResult(float(d["y"]), float(d["x"]), "keyword", found)
