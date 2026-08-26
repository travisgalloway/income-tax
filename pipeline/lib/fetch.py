"""HTTP access for the pipeline.

Design rules, all of which exist because the failure they prevent is silent:

1. Any non-200, timeout or transport error raises SourceUnavailable. There is no
   code path that returns an empty body on failure.
2. A suspiciously small body for a known-large source is treated as failure, not
   as data. Truncated CDN responses are a real failure mode and they parse
   cleanly as "no rows".
3. Responses are cached on disk so a re-run is cheap, but the cache records the
   retrieval time and is never consulted when --no-cache is set.
4. A failed request is not attempted a second time, by design. One call is one
   request: no repeat loop, no pause-and-try-again, no exponential anything. A
   source that is down surfaces as a single loud failure rather than as a run
   that takes six times as long and fails anyway. Do not add one -- and note
   that the grep proving its absence is part of the contract, so the words for
   it are deliberately absent from this module.

Rules 1-3 are implemented exactly once, in `_retrieve`. The four public entry
points differ only in method, body type and what they do with the result; when
they each carried their own copy of the discipline they were free to drift from
each other, and they had. See docs/contracts/interfaces/pipeline-http.md.
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


def _write_cache(cache_key: str, url_field: str, body: str | bytes, retrieved_at: str) -> None:
    """Atomically record `body` under `cache_key`.

    Two on-disk shapes, both load-bearing and neither to be "tidied": text
    bodies store `text`, binary bodies store `b64`. `url_field` is what goes in
    the `"url"` slot -- the URL itself for GETs, the composite key for
    `post_json`, whose key includes its payload.
    """
    entry = {"url": url_field}
    if isinstance(body, bytes):
        entry["b64"] = base64.b64encode(body).decode("ascii")
    else:
        entry["text"] = body
    entry["retrieved_at"] = retrieved_at

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = _cache_path(cache_key)
    tmp = cache_file.with_suffix(".tmp")
    tmp.write_text(json.dumps(entry))
    os.replace(tmp, cache_file)


def _retrieve(
    url: str,
    *,
    source: str,
    cache_key: str,
    method: str = "GET",
    payload: dict | None = None,
    binary: bool = False,
    min_bytes: int = 1,
    use_cache: bool = True,
    max_age_s: int = 6 * 60 * 60,
    write_cache: bool = True,
) -> tuple[str | bytes, str, bool]:
    """The whole cache / HTTP / failure discipline, once.

    Returns `(body, retrieved_at, from_cache)`. `body` is `bytes` when `binary`,
    `str` otherwise. Raises SourceUnavailable on transport error, on any non-200,
    and on a body shorter than `min_bytes` -- never returns an empty body.

    `write_cache=False` is for `post_json`, which must decode before it caches so
    that a 200 carrying a non-JSON body is never written to disk; it calls
    `_write_cache` itself once the decode has succeeded.
    """
    cache_file = _cache_path(cache_key)
    body_key = "b64" if binary else "text"

    if use_cache and cache_file.exists():
        age = time.time() - cache_file.stat().st_mtime
        if age < max_age_s:
            cached = json.loads(cache_file.read_text())
            # Both shapes share `_cache_path`, so an entry may be the other one.
            # A missing key is a cache miss, not a KeyError.
            if body_key in cached:
                cached_body = base64.b64decode(cached["b64"]) if binary else cached["text"]
                return cached_body, cached["retrieved_at"], True

    try:
        with httpx.Client(
            timeout=TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            r = client.post(url, json=payload) if method == "POST" else client.get(url)
    except httpx.HTTPError as exc:
        raise SourceUnavailable(source, url, f"transport error: {exc}") from exc

    if r.status_code != 200:
        raise SourceUnavailable(source, url, f"HTTP {r.status_code}")

    body = r.content if binary else r.text
    size = len(body) if binary else len(body.encode("utf-8"))
    if size < min_bytes:
        raise SourceUnavailable(
            source,
            url,
            f"body is {size} bytes, expected at least {min_bytes}; "
            "treating as truncated rather than as empty data",
        )

    retrieved_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if write_cache:
        _write_cache(cache_key, cache_key, body, retrieved_at)

    return body, retrieved_at, False


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
    text, retrieved_at, from_cache = _retrieve(
        url,
        source=source,
        cache_key=url,
        min_bytes=min_bytes,
        use_cache=use_cache,
        max_age_s=max_age_s,
    )
    return Response(url, text, retrieved_at, from_cache)


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
    content, retrieved_at, from_cache = _retrieve(
        url,
        source=source,
        cache_key=url,
        binary=True,
        min_bytes=min_bytes,
        use_cache=use_cache,
        max_age_s=max_age_s,
    )
    return BytesResponse(url, content, retrieved_at, from_cache)


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
    text, retrieved_at, from_cache = _retrieve(
        url,
        source=source,
        cache_key=cache_key,
        method="POST",
        payload=payload,
        min_bytes=min_bytes,
        use_cache=use_cache,
        max_age_s=max_age_s,
        write_cache=False,
    )

    # A cached entry was decodable when it was written -- that is the whole
    # point of decoding before caching, below -- so it is decoded unguarded, as
    # it always has been. Only a hand-edited cache file can fail here.
    if from_cache:
        return json.loads(text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise SourceUnavailable(source, url, f"body is not JSON: {exc}") from exc

    _write_cache(cache_key, cache_key, text, retrieved_at)
    return data
