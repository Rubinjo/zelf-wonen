from app.dedup import (
    canonical_dedup_key,
    postcode_house_key,
    slugify,
    street_house_key,
)


def test_postcode_house_key_normalizes_and_includes_addition():
    assert postcode_house_key("1012AB", 42, None) == "1012AB-42-"
    assert postcode_house_key("1012 ab", 42, "A") == "1012AB-42a"
    assert postcode_house_key(None, 42, None) is None


def test_street_house_key_is_accent_and_case_insensitive():
    left = street_house_key("Kálverstraat", 42, None)
    right = street_house_key("kalverstraat", 42, None)
    assert left == right == "kalverstraat-42-"
    # Different house-number additions must never merge.
    assert street_house_key("Kalverstraat", 42, "A") != street_house_key("Kalverstraat", 42, "B")


def test_canonical_dedup_key_prefers_postcode():
    assert canonical_dedup_key("1012AB", "Kalverstraat", 42, None) == "1012AB-42-"
    assert canonical_dedup_key(None, "Kalverstraat", 42, None) == "kalverstraat-42-"


def test_slugify():
    assert slugify("Kalverstraat", 42, "Amsterdam") == "kalverstraat-42-amsterdam"
