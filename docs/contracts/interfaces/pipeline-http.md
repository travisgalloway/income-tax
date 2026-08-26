# Interface: `pipeline/lib/fetch.py`, the pipeline's HTTP layer

Every network request the pipeline makes goes through this module. Its rules used to live only in
the module docstring while three near-identical copies of the implementation sat below it — which
is precisely how they drifted apart (issue #40). One private core, `_retrieve`, now implements the
discipline exactly once; the four public entry points choose a mode and adapt the result.

There is one `httpx.Client` construction in the module, and it is inside `_retrieve`. Anything that
adds a second one has left this contract.

**Out of scope, and known:** `pipeline/lib/sources.py` builds its own client for a `HEAD` probe when
discovering the newest Census vintage. That is a fourth request shape outside this core, with its
own deliberately silent failure handling; it is recorded in `docs/parked-findings.md`, not covered
here.

## Public surface

`pipeline/lib/sources.py` imports `TIMEOUT` and `USER_AGENT` **by name**, so both are module-level
attributes and must stay that way — neither may move inside a helper or a config object.

| Name | Kind | Notes |
|---|---|---|
| `CACHE_DIR` | `Path` | `pipeline/.cache`. Read at call time, not captured, so tests can point it at a `tmp_path` via `monkeypatch.setattr`. |
| `USER_AGENT` | `str` | Sent on every request. |
| `TIMEOUT` | `httpx.Timeout` | 60 s overall, 20 s connect. |
| `Response` | frozen dataclass | `url`, `text`, `retrieved_at`, `from_cache`; `.bytes_len` property. |
| `BytesResponse` | frozen dataclass | `url`, `content`, `retrieved_at`, `from_cache`. |
| `_cache_path(url)` | `str -> Path` | `CACHE_DIR / <sha256(key)[:24]>.json`. Private, but the tests use it to prime entries in the real shape. |

```python
fetch(url, *, source, min_bytes=1, use_cache=True, max_age_s=21600) -> Response
fetch_json(url, *, source, min_bytes=1, use_cache=True) -> object
fetch_bytes(url, *, source, min_bytes=1, use_cache=True, max_age_s=21600) -> BytesResponse
post_json(url, payload, *, source, min_bytes=1, use_cache=True, max_age_s=21600) -> object
```

**`fetch_json` takes no `max_age_s`** and hardcodes `fetch`'s default. That asymmetry is deliberate
and preserved: no caller needs it, and adding it is a signature change nobody asked for.

## Failure discipline

Applied identically to all four entry points, because they share one implementation:

1. **Any transport error, timeout or non-200 raises `SourceUnavailable`.** There is no code path
   that returns an empty body on failure. Messages are `transport error: {exc}` and `HTTP {code}`,
   and they carry the request `url` — for `post_json`, the URL, not its composite cache key.
2. **A body shorter than `min_bytes` is a failure, not data.** A truncated CDN response parses
   cleanly as "no rows", which is the silent failure this rule exists to prevent. Text length is
   measured in UTF-8 bytes; binary length is the raw byte count.
3. **Responses are cached on disk**, with the retrieval time recorded, and the cache is never
   consulted when `use_cache=False`. Note that `use_cache` gates the **read** only: a forced refetch
   still writes what it retrieved.
4. **A failed request is never attempted a second time.** There is no retry and no backoff anywhere
   in this module, there never was, and none is to be added — a source that is down must surface as
   one loud failure, not as a run that takes six times as long and fails anyway. Issue #40's body
   described "retry boilerplate" that did not exist; the absence is a design rule, and
   `grep -cin 'retry\|backoff\|time.sleep' pipeline/lib/fetch.py` returning `0` is how it is held.

## The on-disk cache

Both shapes are **load-bearing**. 67 warm entries exist under `pipeline/.cache` at the time of
writing, and a change to either shape silently invalidates all of them — turning a warm run into a
full refetch that still reports success. Do not tidy these.

| Caller | Key | File contents |
|---|---|---|
| `fetch`, `fetch_json` | the bare `url` | `{"url": <url>, "text": <body>, "retrieved_at": <stamp>}` |
| `fetch_bytes` | the bare `url` | `{"url": <url>, "b64": <base64 of body>, "retrieved_at": <stamp>}` |
| `post_json` | `url + "\|" + json.dumps(payload, sort_keys=True)` | `{"url": <the composite key>, "text": <body>, "retrieved_at": <stamp>}` |

`sort_keys=True` is required, not stylistic: USASpending's `spending_by_geography` endpoint is one
URL serving many fiscal-year windows, and an unstable key ordering would make two windows collide
or miss at random. The `"url"` field of a `post_json` entry stores the **composite key**, not the
URL alone.

`retrieved_at` is `time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())`. Writes are atomic: a `.tmp`
sibling plus `os.replace`, so an interrupted run cannot leave a half-written entry that reads as a
valid hit.

An entry is served when it exists, is younger than `max_age_s` (default 6 hours), **and carries the
key the caller needs**.

### The missing-key guard

Both shapes share `_cache_path`, so one URL fetched as text and later as bytes maps to a single
file. **A cache entry lacking the key the caller wants is a cache miss** — the request goes to the
network and overwrites the entry in the requested shape.

This is symmetric across text and binary as of #40, and it is the one intentional behaviour change
that issue made. Before it, only `fetch_bytes` guarded; `fetch` and `post_json` indexed
`cached["text"]` unguarded and raised a bare `KeyError` on a cross-shape entry. The guard can only
fire where the old code crashed, so it removes no working path — it converts a crash into a
refetch. Pinned by `test_a_binary_cache_entry_does_not_crash_a_text_fetch`.

## Where the JSON decode happens, and why the two differ

`post_json` decodes **before** it writes the cache; `fetch_json` decodes **after** `fetch` has
already written it. This is not an inconsistency to reconcile — it follows from which function owns
the write:

- `post_json` owns its own cache write (`_retrieve(..., write_cache=False)`, then `_write_cache`
  once `json.loads` succeeds). A 200 carrying a non-JSON body therefore never reaches the disk.
- `fetch_json` is a thin wrapper over `fetch`, which cached the body before `fetch_json` ever saw
  it. A 200 carrying a non-JSON body *is* cached, and raises `SourceUnavailable("body is not
  JSON: …")` on each attempt until the entry ages out.

One consequence worth knowing: on a **cache hit**, `post_json` decodes unguarded, because anything
on disk was decodable when it was written. Only a hand-edited cache file can raise
`json.JSONDecodeError` out of that path.

## Testing this module offline

Four tests in `pipeline/tests/test_pipeline.py` cover the cache contract with no network at all:
they `monkeypatch.setattr(lib.fetch, "CACHE_DIR", tmp_path)` — which works because `_cache_path`
reads the module global at call time — prime an entry by hand in the exact on-disk shape, and aim
the call at an unroutable `.invalid` host. A cache hit therefore returns and a cache miss can only
raise, which is what lets them prove *no request happened* rather than merely that the right value
came back.

The module's two older failure tests (`test_unreachable_source_raises_rather_than_returning_empty`,
`test_truncated_body_is_treated_as_failure`) do hit the real network. Both would also pass during a
network outage, since an outage raises the same `SourceUnavailable` they assert — so a green run of
those two is weaker evidence than it looks.
