"""Forward-only holdout evaluation. No claims of accuracy without a real sales artifact."""

import argparse
import json
from datetime import date
from statistics import median

from app.model import ComparableSalesModel, InsufficientData
from app.schemas import EstimateRequest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cutoff", type=date.fromisoformat, required=True)
    args = parser.parse_args()
    model = ComparableSalesModel.from_files()
    holdout = [sale for sale in model.sales if sale.saleDate >= args.cutoff]
    model.sales = [sale for sale in model.sales if sale.saleDate < args.cutoff]
    errors = []
    covered = 0
    for sale in holdout:
        request = EstimateRequest.model_validate(
            sale.model_dump(
                include={
                    "postcode",
                    "houseNumber",
                    "propertyType",
                    "livingAreaSqm",
                    "roomCount",
                    "constructionYear",
                }
            )
            | {"houseNumber": sale.houseNumber or 1}
        )
        try:
            result = model.predict(request, as_of=sale.saleDate)
        except InsufficientData:
            continue
        errors.append(abs(result.estimatedValueCents / sale.salePriceCents - 1))
        covered += result.lowerBoundCents <= sale.salePriceCents <= result.upperBoundCents
    print(
        json.dumps(
            {
                "modelVersion": model.model_version,
                "cutoff": args.cutoff.isoformat(),
                "holdoutCount": len(holdout),
                "estimatedCount": len(errors),
                "estimationCoverage": len(errors) / len(holdout) if holdout else None,
                "medianAbsolutePercentageError": median(errors) if errors else None,
                "meanAbsolutePercentageError": sum(errors) / len(errors) if errors else None,
                "intervalCoverage": covered / len(errors) if errors else None,
                "limitation": (
                    "Revised CBS index vintage; not a point-in-time publication backtest. "
                    "Anonymized addresses exclude the entire subject postcode. "
                    "Sparse local research sample; results do not establish national accuracy."
                ),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
