"""Intelligent deduplication across sources.

The same property listed on both Funda and Kamernet has different external IDs.
We merge into one master record when either of these keys match:

- ``postcode + house number`` (``1234AB-42``)
- ``street + house number``  (``kalverstraat-42``)

The house-number addition is folded into both keys (lower-cased) so ``42A`` and
``42B`` never merge. Street matching is accent-insensitive and whitespace/case
normalized so "Kálverstraat" matches "kalverstraat".
"""

from __future__ import annotations

import re

from .normalizer import clean_text, strip_accents

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def _compact(value: str) -> str:
    return _SLUG_STRIP.sub("-", strip_accents(clean_text(value).lower())).strip("-")


def house_number_addition_key(addition: str | None) -> str:
    return _compact(addition or "") or "-"


def postcode_house_key(postcode: str | None, house_number: int, addition: str | None) -> str | None:
    if not postcode or house_number is None:
        return None
    normalized = clean_text(postcode).upper().replace(" ", "")
    if not re.fullmatch(r"\d{4}[A-Za-z]{2}", normalized):
        return None
    return f"{normalized}-{house_number}{house_number_addition_key(addition)}"


def street_house_key(street: str | None, house_number: int, addition: str | None) -> str | None:
    if not street or house_number is None:
        return None
    return f"{_compact(street)}-{house_number}{house_number_addition_key(addition)}"


def canonical_dedup_key(
    postcode: str | None,
    street: str | None,
    house_number: int,
    addition: str | None,
) -> str:
    """Primary unique key: prefer postcode, fall back to street."""
    key = postcode_house_key(postcode, house_number, addition)
    if key:
        return key
    return street_house_key(street, house_number, addition) or (
        f"unkeyed-{clean_text(street)}-{house_number}"
    )


def slugify(street: str | None, house_number: int, city: str | None) -> str:
    base = _compact(f"{street or 'woning'} {house_number} {city or ''}") or "woning"
    return base[:80]
