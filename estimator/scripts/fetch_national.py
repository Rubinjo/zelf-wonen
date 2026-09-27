"""Refresh official municipal WOZ medians; never treat them as sale labels."""

import csv
import hashlib
import io
import json
import zipfile
from pathlib import Path
from urllib.request import urlopen

SOURCE = "https://www.cbs.nl/item?sc_itemid=9f5fb087-2192-4ede-91d2-29bc7e0d3a9e&sc_lang=nl-nl"


def main():
    raw = urlopen(SOURCE, timeout=60).read()
    html = raw.decode("utf-8")
    decoder = json.JSONDecoder()
    municipalities = {}
    for part in html.split('"csvData":')[1:]:
        value, _ = decoder.raw_decode(part.lstrip())
        if not value.startswith("Gemeentenaam;Statcode;WOZ per m2 (mediaan)"):
            continue
        rows = list(csv.reader(io.StringIO(value), delimiter=";"))
        if rows[1][-1] != "2025":
            continue
        for name, code, amount in rows[2:]:
            municipalities[code] = {"name": name, "wozPerSqm": int(amount)}
    if len(municipalities) != 342 or any(v["wozPerSqm"] <= 0 for v in municipalities.values()):
        raise ValueError(f"Expected 342 valid municipalities, got {len(municipalities)}")
    payload = {
        "source": SOURCE,
        "license": "CC BY 4.0",
        "publishedAt": "2026-02-13",
        "referenceMonth": "2024-01",
        "assessmentYear": 2025,
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "municipalities": municipalities,
    }
    asking_url = "https://www.kaggle.com/api/v1/datasets/download/dekeijzer/vraagprijs-per-m-per-gemeente-nederland?datasetVersionNumber=1"
    archive = urlopen(asking_url, timeout=60).read()
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        asking_raw = zipped.read("gemeente-prijs-per-m2.csv")
    rows = list(csv.DictReader(io.StringIO(asking_raw.decode("utf-8-sig"))))
    digest = hashlib.sha256(asking_raw).hexdigest()
    if digest != "31821762202714ed3418cda9c37f7a5beacdb44d220ec7332288de4e9552b49d":
        raise ValueError("Asking snapshot changed; review provenance before importing")
    aliases = {
        "Beek": "GM0888",
        "Hengelo": "GM0164",
        "Laren": "GM0417",
        "Middelburg": "GM0687",
        "Noardeast-Fryslân": "GM1970",
        "Rijswijk": "GM0603",
        "Stein": "GM0971",
        "Súdwest-Fryslân": "GM1900",
    }
    names = {v["name"].casefold(): code for code, v in municipalities.items()}
    asking = {}
    for row in rows:
        name = row["gemeente"]
        code = aliases.get(name) or names.get(name.casefold())
        if not code or code not in municipalities or code in asking:
            raise ValueError(f"Unmatched or duplicate municipality: {name}")
        asking[code] = {"medianPerSqm": int(row["median_eur_per_m2"]), "count": int(row["n"])}
        if min(asking[code].values()) <= 0:
            raise ValueError("Invalid asking benchmark")
    if len(asking) != 338:
        raise ValueError("Expected 338 asking benchmarks")
    payload["asking"] = {
        "source": "https://data.residentievinder.nl/prijs-per-m2/over-deze-data/",
        "downloadUrl": asking_url,
        "license": "CC BY 4.0",
        "publishedAt": "2026-08-15",
        "sourceSha256": digest,
        "municipalities": asking,
    }
    regional_source = "https://opendata.cbs.nl/ODataApi/OData/85792NED/TypedDataSet"
    regional = {}
    next_url = regional_source
    while next_url:
        page = json.load(urlopen(next_url, timeout=60))
        for row in page["value"]:
            region, period = row["RegioS"].strip(), row["Perioden"]
            value = row["PrijsindexVerkoopprijzen_1"]
            if "KW" in period and value is not None:
                if not 0 < value < 1000:
                    raise ValueError("Invalid regional price index")
                regional.setdefault(region, {})[period] = value
        next_url = page.get("odata.nextLink")
    if not all(f"PV{code}" in regional for code in range(20, 32)) or "NL01" not in regional:
        raise ValueError("Missing provincial price indices")
    payload["regionalIndices"] = regional
    payload["regionalIndexSource"] = regional_source
    target = Path(__file__).resolve().parents[1] / "data" / "national-woz.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(target)
    print(f"Saved {len(municipalities)} WOZ medians and {len(asking)} asking benchmarks")


if __name__ == "__main__":
    main()
