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
            graph = parsed.get("@graph")
            if isinstance(graph, list):
                objects.extend(item for item in graph if isinstance(item, dict))
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
        if script.attributes.get("id") in var_names:
            try:
                parsed = json.loads(text)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                continue
        for var_name in var_names:
            marker = f"{var_name}"
            if marker not in text:
                continue
            match = re.search(rf"{re.escape(var_name)}\s*=\s*", text)
            if not match:
                continue
            try:
                parsed, _ = json.JSONDecoder().raw_decode(text[match.end() :])
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                continue
    return {}


def extract_nuxt_data(html: str) -> dict[str, Any]:
    """Decode Nuxt's devalue reference table without evaluating page scripts."""
    node = HTMLParser(html).css_first("script#__NUXT_DATA__")
    if node is None:
        return {}
    try:
        table = json.loads(node.text())
        if not isinstance(table, list):
            return {}
        cache: dict[int, Any] = {}

        def resolve(index: int) -> Any:
            if index < 0:
                return None
            if index in cache:
                return cache[index]
            value = table[index]
            if isinstance(value, dict):
                result: dict[str, Any] = {}
                cache[index] = result
                result.update({key: resolve(ref) for key, ref in value.items()})
                return result
            if isinstance(value, list):
                if value and isinstance(value[0], str):
                    if value[0] in {"Reactive", "ShallowReactive", "Ref", "ShallowRef"}:
                        result = resolve(value[1])
                        cache[index] = result
                        return result
                    return None  # Unneeded custom types (e.g. Set/Date).
                items: list[Any] = []
                cache[index] = items
                items.extend(resolve(ref) for ref in value)
                return items
            cache[index] = value
            return value

        result = resolve(0)
        return result if isinstance(result, dict) else {}
    except (ValueError, IndexError, TypeError, RecursionError):
        return {}


def extract_labelled_facts(html: str) -> dict[str, str]:
    from ..normalizer import clean_text

    facts: dict[str, str] = {}
    for term in HTMLParser(html).css("dt"):
        value = term.next
        while value is not None and value.tag != "dd":
            value = value.next
        if value is not None:
            label = clean_text(term.text()).lower()
            text = clean_text(value.text(separator=" "))
            if text:
                facts[label] = text
    return facts


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
