"""Refresh the public CBS/Kadaster monthly index; no property microdata is downloaded."""

import hashlib
import json
from datetime import date
from pathlib import Path
from urllib.request import urlopen

URL = "https://opendata.cbs.nl/ODataApi/OData/85773NED/TypedDataSet"
OUT = Path(__file__).resolve().parents[1] / "data" / "cbs-index.json"


def main() -> None:
    rows = []
    url = URL
    while url:
        with urlopen(url, timeout=60) as response:
            page = json.load(response)
        rows.extend(page["value"])
        url = page.get("odata.nextLink")
    months = {}
    for row in rows:
        period = row["Perioden"].strip()
        value = row["PrijsindexVerkoopprijzen_1"]
        if "MM" in period and value and value > 0:
            month = period[:4] + "-" + period[-2:]
            if month < date.today().strftime("%Y-%m"):
                months[month] = value
    if not months:
        raise ValueError("CBS returned no monthly index values")
    artifact = {
        "source": URL,
        "dataset": "85773NED",
        "retrievedAt": date.today().isoformat(),
        "attribution": "CBS / Kadaster, StatLine; CC BY 4.0",
        "months": dict(sorted(months.items())),
    }
    OUT.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(
        f"{len(months)} months through {max(months)}; sha256={hashlib.sha256(OUT.read_bytes()).hexdigest()}"
    )


if __name__ == "__main__":
    main()
