from datetime import date, timedelta

import pytest

from app.data import Sale
from app.model import ComparableSalesModel


@pytest.fixture
def sales():
    # Synthetic test fixtures only; never packaged as historical market evidence.
    return [
        Sale(
            transactionId=f"t{i}",
            propertyId=f"p{i}",
            postcode="1012AC",
            houseNumber=i + 1,
            propertyType="APARTMENT",
            livingAreaSqm=82.5,
            roomCount=4,
            constructionYear=1998,
            saleDate=date.today() - timedelta(days=120),
            salePriceCents=40_000_000,
        )
        for i in range(8)
    ]


@pytest.fixture
def model(sales):
    month = sales[0].saleDate.strftime("%Y-%m")
    previous_month = (date.today().replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    return ComparableSalesModel(sales, {month: 100, previous_month: 110}, "test-v1")


@pytest.fixture(autouse=True)
def api_model(monkeypatch, model):
    monkeypatch.setattr("app.main.model", model)
