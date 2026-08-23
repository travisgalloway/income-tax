"""Pipeline error types.

The distinction that matters: a source we could not READ is never the same thing
as a source that returned nothing. The first is UNAVAILABLE and must fail the
run; the second may be legitimate. Collapsing the two is how a network blip
becomes a flat line at zero on a published chart.
"""

from __future__ import annotations


class PipelineError(Exception):
    """Base for every error the pipeline raises deliberately."""


class SourceUnavailable(PipelineError):
    """A source could not be read. Never degrade this to an empty series."""

    def __init__(self, source: str, url: str, reason: str) -> None:
        super().__init__(f"UNAVAILABLE {source}: {reason} <{url}>")
        self.source = source
        self.url = url
        self.reason = reason


class ValidationFailed(PipelineError):
    """One or more validation checks failed. Nothing is written."""

    def __init__(self, failures: list[str]) -> None:
        joined = "\n".join(f"  - {f}" for f in failures)
        super().__init__(f"{len(failures)} validation failure(s):\n{joined}")
        self.failures = failures


class CuratedMismatch(PipelineError):
    """Curated input refers to something the fetched data does not contain.

    This is the tripwire for a source silently renaming or dropping a series.
    """
