"""Shared public-search helpers, without private API dependencies."""

import re
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

from selectolax.parser import HTMLParser

from ..http_client import ScrapeError


def page_url(url: str, key: str, page: int) -> str:
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query) if k != key]
    return urlunsplit(parts._replace(query=urlencode([*query, (key, str(page))])))


def source_url(url: str, base: str) -> str:
    resolved = urlsplit(urljoin(base, url))
    expected = urlsplit(base)
    if resolved.scheme != "https" or resolved.netloc != expected.netloc or resolved.username:
        raise ScrapeError("search page contains a URL outside the configured source")
    return urlunsplit(resolved._replace(query="", fragment=""))


def listing_links(html: str, base: str, pattern: re.Pattern[str]) -> dict[str, str]:
    links: dict[str, str] = {}
    for node in HTMLParser(html).css("a[href]"):
        href = node.attributes.get("href", "")
        match = pattern.search(urlsplit(href).path)
        if match:
            links[match.group(1)] = source_url(href, base)
    return links
