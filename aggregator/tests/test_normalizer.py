from app.models import EnergyLabel, ListingAvailability, ListingPurpose, PropertyType
from app.normalizer import (
    normalize_availability,
    normalize_energy_label,
    normalize_house_number,
    normalize_house_number_addition,
    normalize_postcode,
    normalize_price_cents,
    normalize_property_type,
    normalize_purpose,
)


def test_normalize_postcode_formats():
    assert normalize_postcode("1012 ab") == "1012AB"
    assert normalize_postcode("1012AB") == "1012AB"
    assert normalize_postcode(" 1012 AB ") == "1012AB"
    assert normalize_postcode("nonsense") is None
    assert normalize_postcode(None) is None


def test_normalize_house_number_extracts_digits():
    assert normalize_house_number("42A") == 42
    assert normalize_house_number("huisnummer 7") == 7
    assert normalize_house_number(None) is None


def test_normalize_price_cents():
    assert normalize_price_cents("€ 450.000") == 45_000_000
    assert normalize_price_cents("1.250,-") == 125_000
    assert normalize_price_cents("1250") == 125_000
    assert normalize_price_cents("1.250,50") == 125_050
    assert normalize_price_cents(None) is None


def test_normalize_energy_label():
    assert normalize_energy_label("A+") is EnergyLabel.A_PLUS
    assert normalize_energy_label("Energielabel C") is EnergyLabel.C
    assert normalize_energy_label("A+++++") is EnergyLabel.A_PLUS_PLUS_PLUS_PLUS_PLUS


def test_normalize_property_type():
    assert normalize_property_type("Appartement") is PropertyType.APARTMENT
    assert normalize_property_type("Tussenwoning") is PropertyType.HOUSE
    assert normalize_property_type("parkeerplaats") is PropertyType.PARKING


def test_normalize_availability():
    assert normalize_availability("Verhuurd") is ListingAvailability.EXPIRED
    assert normalize_availability("Te koop") is ListingAvailability.ACTIVE
    assert normalize_availability("offline") is ListingAvailability.OFFLINE


def test_normalize_purpose():
    assert normalize_purpose("huur") is ListingPurpose.RENT
    assert normalize_purpose("koop") is ListingPurpose.SALE
    assert normalize_purpose("buy") is ListingPurpose.SALE


def test_house_number_suffix_does_not_split_plain_numbers():
    assert normalize_house_number_addition("42") is None
    assert normalize_house_number_addition("Kalverstraat 42A") == "A"
    assert normalize_house_number_addition("42-2") == "2"
