import csv
import sys

import pytest

from app.data import load_sales
from scripts.prepare_sales import main


def test_import_normalizes_and_preserves_valid_artifact_on_bad_input(tmp_path, sales, monkeypatch):
    source = tmp_path / "sales.csv"
    output = tmp_path / "sales.json"
    rows = [sale.model_dump(mode="json") for sale in sales]
    rows[0]["postcode"] = "1012 ac"

    def write_csv():
        with source.open("w", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare_sales",
            str(source),
            "--output",
            str(output),
            "--source",
            "synthetic test",
            "--license",
            "test only",
        ],
    )
    write_csv()
    main()
    dataset, version = load_sales(output)
    assert dataset.sales[0].postcode == "1012AC"
    assert len(version) == 12
    original = output.read_bytes()
    rows[0]["salePriceCents"] = -1
    write_csv()
    with pytest.raises(ValueError, match="line 2"):
        main()
    assert output.read_bytes() == original
