"""Validate a normalized, licensed CSV export into the service artifact.

Run from estimator: uv run python -m scripts.prepare_sales input.csv --source ... --license ...
"""

import argparse
import csv
from pathlib import Path

from app.data import Sale, SalesDataset


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path)
    parser.add_argument("--source", required=True)
    parser.add_argument("--license", required=True)
    parser.add_argument("--output", type=Path, default=Path("data/sales.json"))
    args = parser.parse_args()
    sales = []
    with args.csv.open(encoding="utf-8-sig", newline="") as stream:
        for line, row in enumerate(csv.DictReader(stream), start=2):
            row["postcode"] = row["postcode"].replace(" ", "").upper()
            try:
                sales.append(Sale.model_validate(row))
            except ValueError as error:
                raise ValueError(f"Invalid sale at CSV line {line}: {error}") from error
    dataset = SalesDataset(
        source=args.source, license=args.license, priceBasis="completed-sale", sales=sales
    )
    # Validate the whole export before replacing the serving artifact.
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(dataset.model_dump_json(indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(f"Prepared {len(sales)} completed sales into {args.output}")


if __name__ == "__main__":
    main()
