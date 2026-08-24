"""Shared HTML/JSON extraction helpers for source adapters."""

from __future__ import annotations

import json
import re
from typing import Any

from selectolax.parser import HTMLParser

_SCRIPT_JSON_LD = "script[type='application/ld+json']"


def extract_json_ld(html: str) -> list[dict[str, Any]]:
    """Return every parsed JSON-LD object embedded in a page."""
    tree = HTMLParser(html)
    objects: list[dict[str, Any]] = []
    for node in tree.css(_SCRIPT_JSON_LD):
        text = (node.text() or "").strip()
        if not text:
            continue
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            objects.append(parsed)
        elif isinstance(parsed, list):
            objects.extend(item for item in parsed if isinstance(item, dict))
    return objects


def find_objects(html: str, types: set[str]) -> list[dict[str, Any]]:
    wanted = {item.lower() for item in types}
    matches: list[dict[str, Any]] = []
    for obj in extract_json_ld(html):
        obj_type = str(obj.get("@type") or "").lower()
        if obj_type in wanted or any(t in obj_type for t in wanted):
            matches.append(obj)
    return matches


def extract_meta(html: str) -> dict[str, str]:
    """Collect og:*/twitter:* and description meta tags into a flat dict."""
    tree = HTMLParser(html)
    result: dict[str, str] = {}
    for node in tree.css("meta"):
        attrs = node.attributes or {}
        key = attrs.get("property") or attrs.get("name") or attrs.get("itemprop")
        content = attrs.get("content")
        if key and content:
            result[key.lower()] = content.strip()
    return result


def extract_embedded_json(html: str, var_names: tuple[str, ...]) -> dict[str, Any]:
    """Extract ``window.__INITIAL_STATE__ = {...};`` style embedded JSON."""
    tree = HTMLParser(html)
    for script in tree.css("script"):
        text = script.text() or ""
        for var_name in var_names:
            marker = f"{var_name}"
            if marker not in text:
                continue
            match = re.search(
                rf"{re.escape(var_name)}\s*=\s*(\{{.*?\}}|\[.*?\])\s*;?", text, re.DOTALL
            )
            if not match:
                continue
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                continue
    return {}


def first_number(value: Any) -> int | float | None:
    """Pull the first integer/float out of an arbitrary scalar."""
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    match = re.search(r"(\d+(?:[.,]\d+)?)", str(value).replace(" ", ""))
    return float(match.group(1).replace(",", ".")) if match else None


def deep_get(mapping: dict[str, Any], *keys: str) -> Any:
    current: Any = mapping
    for key in keys:
        if isinstance(current, dict):
            current = current.get(key)
        elif isinstance(current, list):
            for item in current:
                found = deep_get(item, key) if isinstance(item, dict) else None
                if found is not None:
                    return found
            return None
        else:
            return None
    return current


def external_id_from_url(url: str) -> str:
    """Heuristic: last 6+ digit run in a URL path is the provider object id."""
    path = url.split("?")[0]
    matches = re.findall(r"/(\d{6,})", path)
    return matches[-1] if matches else re.sub(r"[^a-zA-Z0-9]", "-", path).strip("-")[:80]
