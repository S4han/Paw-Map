"""PoC 스크립트 공용 도우미. 표준 라이브러리만 사용한다."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

OUT_DIR = Path(__file__).resolve().parent / "out"


def env_key(name: str) -> str:
    """환경변수에서 키를 읽는다. 실수로 붙은 앞뒤 공백·따옴표는 제거한다."""
    value = os.environ.get(name, "").strip().strip("'\"").strip()
    if not value:
        sys.exit(f"[중단] 환경변수 {name} 가 비어 있습니다. 키는 코드나 채팅이 아닌 환경변수로만 넣으세요.")
    return value


def http_get(url: str, headers: dict[str, str] | None = None, timeout: float = 20) -> tuple[int, str]:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:  # DNS 실패·프록시 차단·시간 초과
        return 0, f"연결 실패: {e.reason}"


def http_post_json(url: str, body: dict[str, Any], headers: dict[str, str], timeout: float = 20) -> tuple[int, str]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:  # DNS 실패·프록시 차단·시간 초과
        return 0, f"연결 실패: {e.reason}"


def mask(text: str, secret: str) -> str:
    """로그·저장 파일에 키가 남지 않도록 가린다(인코딩된 형태 포함)."""
    for s in {secret, urllib.parse.quote(secret, safe=""), urllib.parse.unquote(secret)}:
        if s:
            text = text.replace(s, "***")
    return text


def save(name: str, payload: Any) -> Path:
    """결과를 poc/out/ 에 저장한다(이 폴더는 .gitignore 대상: 약관 확인 전 원본 데이터 커밋 금지)."""
    OUT_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = OUT_DIR / f"{name}-{stamp}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
