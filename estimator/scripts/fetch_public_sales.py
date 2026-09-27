"""Prepare the free Utrecht real-sales release (not the older synthetic CSVs).

Run from estimator/: uv run python -m scripts.fetch_public_sales
"""

import argparse
import csv
import hashlib
import io
from decimal import Decimal
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

from app.data import Sale, SalesDataset

SOURCE = "https://www.kaggle.com/datasets/ictinstitute/utrecht-housing-dataset"
DOWNLOAD = (
    "https://www.kaggle.com/api/v1/datasets/download/"
    "ictinstitute/utrecht-housing-dataset?datasetVersionNumber=5"
)
MEMBER = "2025-housing-dataset-alldata.csv"
SOURCE_SHA256 = "a57964f094652d5f0f90c2d14a29e57c2c0740c2ad04fb00386dbf3e4dc526d0"
OUT = Path(__file__).resolve().parents[1] / "data" / "public-sales.json"
TYPES = {"woonhuis": "HOUSE", "appartement": "APARTMENT"}
REQUIRED = {
    "id",
    "zipcode4",
    "zipcode6",
    "zipcode6id",
    "housetype",
    "house-area",
    "rooms",
    "buildyear",
    "retailvalue",
    "valuationdate",
    "x-coor",
    "y-coor",
}


def prepare(raw: bytes) -> SalesDataset:
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    if not REQUIRED.issubset(reader.fieldnames or []):
        raise ValueError("Expected the real 2025 housing dataset schema")
    sales = []
    for line, row in enumerate(reader, start=2):
        try:
            postcode = row["zipcode6"].strip().upper()
            if postcode[:4] != row["zipcode4"]:
                raise ValueError("Inconsistent postcode columns")
            # The publication defines retailvalue in thousands of euros.
            cents = Decimal(row["retailvalue"]) * 100_000
            if not cents.is_finite() or cents != cents.to_integral_value():
                raise ValueError("Invalid transaction price")
            sales.append(
                Sale.model_validate(
                    {
                        "transactionId": "utrecht-" + row["id"],
                        "propertyId": "utrecht-" + row["zipcode6id"],
                        "postcode": postcode,
                        "houseNumber": None,
                        "propertyType": TYPES[row["housetype"]],
                        "livingAreaSqm": row["house-area"],
                        "roomCount": row["rooms"],
                        "constructionYear": row["buildyear"],
                        "saleDate": row["valuationdate"],
                        "salePriceCents": int(cents),
                        "latitude": row["x-coor"],
                        "longitude": row["y-coor"],
                    }
                )
            )
        except (ValueError, KeyError, ArithmeticError) as error:
            raise ValueError(f"Invalid public sale at CSV line {line}: {error}") from error
    dataset = SalesDataset(
        source=SOURCE,
        sourceVersion=f"Kaggle version 5; {MEMBER}",
        sourceSha256=hashlib.sha256(raw).hexdigest(),
        license="CC BY-SA 4.0",
        licenseUrl="https://creativecommons.org/licenses/by-sa/4.0/",
        attribution=(
            "Sieuwert van Otterloo and Pavlo Burda (2025), The Utrecht Housing dataset: "
            "A housing appraisal dataset. ICT Institute. https://doi.org/10.54822/QVHM1662. "
            "Adapted by ZelfWonen: selected fields, normalized types, prices in euro cents; "
            "anonymized house numbers represented as null. No endorsement implied."
        ),
        priceBasis="completed-sale",
        sales=sales,
    )
    if len({sale.propertyId for sale in dataset.sales}) != len(dataset.sales):
        raise ValueError("Duplicate public property IDs")
    return dataset


def write_artifact(raw: bytes, output: Path) -> SalesDataset:
    # Pin the real-data member: the same archive also contains synthetic datasets.
    # Fail before replacing a working artifact if upstream data changes unexpectedly.
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError("Public dataset checksum changed; review the source before updating")
    dataset = prepare(raw)
    if len(dataset.sales) != 153:
        raise ValueError("Expected 153 real completed sales")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    temporary.write_text(dataset.model_dump_json(indent=2) + "\n", encoding="utf-8")
    temporary.replace(output)
    return dataset


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUT)
    args = parser.parse_args()
    with urlopen(DOWNLOAD, timeout=60) as response:
        archive = response.read()
    with ZipFile(io.BytesIO(archive)) as bundle:
        raw = bundle.read(MEMBER)
    dataset = write_artifact(raw, args.output)
    print(f"Prepared {len(dataset.sales)} real completed sales into {args.output}")


if __name__ == "__main__":
    main()
