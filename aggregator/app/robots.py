"""Robots rules used by both page and media requests.

Merge repeated user-agent groups, support wildcard/end anchors, and prefer the
longest matching path (Allow wins ties). Crawl-delay is a supported extension.
"""

import math
import re
from urllib.parse import unquote, urlsplit


class RobotsRules:
    def __init__(self, text: str, user_agent: str) -> None:
        groups: list[tuple[list[str], list[tuple[str, str]]]] = []
        agents: list[str] = []
        directives: list[tuple[str, str]] = []
        for line in text.lstrip("\ufeff").splitlines():
            name, separator, value = line.split("#", 1)[0].partition(":")
            if not separator:
                continue
            name, value = name.strip().lower(), value.strip()
            if name == "user-agent":
                if directives:
                    groups.append((agents, directives))
                    agents, directives = [], []
                agents.append(value.lower())
            elif agents:
                directives.append((name, value))
        groups.append((agents, directives))
        agent = user_agent.lower().split("/", 1)[0]
        matches = [
            (max((len(a) for a in names if a != "*" and a in agent), default=0), rules)
            for names, rules in groups
            if "*" in names or any(a in agent for a in names)
        ]
        specificity = max((score for score, _ in matches), default=0)
        self.rules: list[tuple[re.Pattern[str], int, bool]] = []
        self.delay = 0.0
        for score, rules in matches:
            if score != specificity:
                continue
            for name, value in rules:
                if name in ("allow", "disallow") and value:
                    value = unquote(value)
                    anchored = value.endswith("$")
                    path = value[:-1] if anchored else value
                    pattern = "^" + re.escape(path).replace(r"\*", ".*") + ("$" if anchored else "")
                    self.rules.append(
                        (re.compile(pattern), len(path.replace("*", "")), name == "allow")
                    )
                elif name == "crawl-delay":
                    try:
                        delay = float(value)
                        if math.isfinite(delay):
                            self.delay = max(self.delay, delay)
                    except ValueError:
                        pass

    def can_fetch(self, url: str) -> bool:
        parts = urlsplit(url)
        path = unquote(parts.path or "/") + ("?" + unquote(parts.query) if parts.query else "")
        matches = [(length, allow) for pattern, length, allow in self.rules if pattern.search(path)]
        return max(matches, default=(0, True))[1]
