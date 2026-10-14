"""표준 라이브러리 HTTP 도우미. 키는 로그·오류 메시지에 남기지 않는다."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


class HttpError(Exception):
    pass


def get_json(url: str, headers: dict[str, str] | None = None, *, secret: str = "", retries: int = 2, timeout: float = 20) -> Any:
    last = ""
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers or {})
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:300]
            if e.code < 500 and e.code != 429:
                raise HttpError(_mask(f"HTTP {e.code}: {body}", secret)) from None
            last = f"HTTP {e.code}"
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = str(getattr(e, "reason", e))
        if attempt < retries:
            time.sleep(2 ** (attempt + 1))
    raise HttpError(_mask(f"요청 실패({last})", secret))


def _mask(text: str, secret: str) -> str:
    if not secret:
        return text
    for s in {secret, urllib.parse.quote(secret, safe="")}:
        text = text.replace(s, "***")
    return text
