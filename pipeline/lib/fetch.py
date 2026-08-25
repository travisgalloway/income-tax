"""HTTP access for the pipeline.

Design rules, all of which exist because the failure they prevent is silent:

1. Any non-200, timeout or transport error raises SourceUnavailable. There is no
   code path that returns an empty body on failure.
2. A suspiciously small body for a known-large source is treated as failure, not
   as data. Truncated CDN responses are a real failure mode and they parse
   cleanly as "no rows".
3. Responses are cached on disk so a re-run is cheap, but the cache records the
   retrieval time and is never consulted when --no-cache is set.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from .errors import SourceUnavailable

CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache"
USER_AGENT = "income-tax-pipeline/0.1 (+https://github.com/travisgalloway/income-tax)"
TIMEOUT = httpx.Timeout(60.0, connect=20.0)


@dataclass(frozen=True)
class Response:
    """A fetched body plus the provenance we are obliged to record."""

    url: str
    text: str
    retrieved_at: str
    from_cache: bool

    @property
    def bytes_len(self) -> int:
        return len(self.text.encode("utf-8"))


def _cache_path(url: str) -> Path:
    return CACHE_DIR / f"{hashlib.sha256(url.encode()).hexdigest()[:24]}.json"


def fetch(
    url: str,
    *,
    source: str,
    min_bytes: int = 1,
    use_cache: bool = True,
    max_age_s: int = 6 * 60 * 60,
) -> Response:
    """Fetch `url`, or raise SourceUnavailable. Never returns empty on failure.

    `min_bytes` guards against truncated responses that would otherwise parse as
    an empty dataset.
    """
    cache_file = _cache_path(url)

    if use_cache and cache_file.exists():
        age = time.time() - cache_file.stat().st_mtime
        if age < max_age_s:
            cached = json.loads(cache_file.read_text())
            return Response(url, cached["text"], cached["retrieved_at"], True)

    try:
        with httpx.Client(
            timeout=TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            r = client.get(url)
    except httpx.HTTPError as exc:
        raise SourceUnavailable(source, url, f"transport error: {exc}") from exc

    if r.status_code != 200:
        raise SourceUnavailable(source, url, f"HTTP {r.status_code}")

    text = r.text
    if len(text.encode("utf-8")) < min_bytes:
        raise SourceUnavailable(
            source,
            url,
            f"body is {len(text.encode())} bytes, expected at least {min_bytes}; "
            "treating as truncated rather than as empty data",
        )

    retrieved_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = cache_file.with_suffix(".tmp")
    tmp.write_text(json.dumps({"url": url, "text": text, "retrieved_at": retrieved_at}))
    os.replace(tmp, cache_file)

    return Response(url, text, retrieved_at, False)


def fetch_json(url: str, *, source: str, min_bytes: int = 1, use_cache: bool = True) -> object:
    resp = fetch(url, source=source, min_bytes=min_bytes, use_cache=use_cache)
    try:
        return json.loads(resp.text)
    except json.JSONDecodeError as exc:
        raise SourceUnavailable(source, url, f"body is not JSON: {exc}") from exc


@dataclass(frozen=True)
class BytesResponse:
    """A fetched binary body plus the provenance we are obliged to record."""

    url: str
    content: bytes
    retrieved_at: str
    from_cache: bool


def fetch_bytes(
    url: str,
    *,
    source: str,
    min_bytes: int = 1,
    use_cache: bool = True,
    max_age_s: int = 6 * 60 * 60,
) -> BytesResponse:
    """Binary counterpart to `fetch`, for `.xlsx` sources.

    Same failure discipline: non-200, transport error and a short body all raise
    SourceUnavailable, never an empty result. The cache reuses `_cache_path` and
    stores the body as base64 under a `b64` key so a binary payload round-trips
    through the existing JSON cache format.
    """
    cache_file = _cache_path(url)

    if use_cache and cache_file.exists():
        age = time.time() - cache_file.stat().st_mtime
        if age < max_age_s:
            cached = json.loads(cache_file.read_text())
            if "b64" in cached:
                return BytesResponse(
                    url, base64.b64decode(cached["b64"]), cached["retrieved_at"], True
                )

    try:
        with httpx.Client(
            timeout=TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            r = client.get(url)
    except httpx.HTTPError as exc:
        raise SourceUnavailable(source, url, f"transport error: {exc}") from exc

    if r.status_code != 200:
        raise SourceUnavailable(source, url, f"HTTP {r.status_code}")

    content = r.content
    if len(content) < min_bytes:
        raise SourceUnavailable(
            source,
            url,
            f"body is {len(content)} bytes, expected at least {min_bytes}; "
            "treating as truncated rather than as empty data",
        )

    retrieved_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = cache_file.with_suffix(".tmp")
    tmp.write_text(json.dumps({
        "url": url,
        "b64": base64.b64encode(content).decode("ascii"),
        "retrieved_at": retrieved_at,
    }))
    os.replace(tmp, cache_file)

    return BytesResponse(url, content, retrieved_at, False)


def post_json(
    url: str,
    payload: dict,
    *,
    source: str,
    min_bytes: int = 1,
    use_cache: bool = True,
    max_age_s: int = 6 * 60 * 60,
) -> object:
    """POST `payload` as JSON and return the decoded JSON response, or raise.

    Not part of the original `fetch`/`fetch_json` pair (those are GET-only), but
    USASpending's `spending_by_geography` endpoint is POST-only and keyless. Same
    failure discipline: the cache key includes the payload, since two different
    fiscal-year windows against the same URL must not collide.
    """
    cache_key = url + "|" + json.dumps(payload, sort_keys=True)
    cache_file = _cache_path(cache_key)

    if use_cache and cache_file.exists():
        age = time.time() - cache_file.stat().st_mtime
        if age < max_age_s:
            cached = json.loads(cache_file.read_text())
            return json.loads(cached["text"])

    try:
        with httpx.Client(
            timeout=TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            r = client.post(url, json=payload)
    except httpx.HTTPError as exc:
        raise SourceUnavailable(source, url, f"transport error: {exc}") from exc

    if r.status_code != 200:
        raise SourceUnavailable(source, url, f"HTTP {r.status_code}")

    text = r.text
    if len(text.encode("utf-8")) < min_bytes:
        raise SourceUnavailable(
            source,
            url,
            f"body is {len(text.encode())} bytes, expected at least {min_bytes}; "
            "treating as truncated rather than as empty data",
        )

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise SourceUnavailable(source, url, f"body is not JSON: {exc}") from exc

    retrieved_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = cache_file.with_suffix(".tmp")
    tmp.write_text(json.dumps({"url": cache_key, "text": text, "retrieved_at": retrieved_at}))
    os.replace(tmp, cache_file)

    return data
