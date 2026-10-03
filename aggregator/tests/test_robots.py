from app.robots import RobotsRules


def test_repeated_wildcard_groups_and_longest_allow():
    rules = RobotsRules(
        """User-agent: *
Allow: /
User-agent: *
Disallow: /private
Allow: /private/public
Disallow: /*secret$
Crawl-delay: 8
""",
        "zelfwonen-aggregator/0.1",
    )
    assert not rules.can_fetch("https://example.org/private")
    assert rules.can_fetch("https://example.org/private/public")
    assert not rules.can_fetch("https://example.org/path/secret")
    assert rules.can_fetch("https://example.org/path/secret/more")
    assert rules.delay == 8


def test_specific_agent_overrides_wildcard_group():
    rules = RobotsRules(
        "User-agent: *\nDisallow: /\nUser-agent: zelfwonen-aggregator\nAllow: /",
        "zelfwonen-aggregator/0.1",
    )
    assert rules.can_fetch("https://example.org/path")
