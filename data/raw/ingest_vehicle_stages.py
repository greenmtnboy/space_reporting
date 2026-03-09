#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/lvs.html

from ingest_core import emit, ingest_gcat_file

LVS_HEADERS = [
    "LV_Name", "LV_Variant", "Stage_No", "Stage_Name", "Qualifier",
    "Dummy", "Multiplicity", "Stage_Impulse", "Stage_Apogee", "Stage_Perigee",
    "Perigee_Qual",
]

if __name__ == "__main__":
    table = ingest_gcat_file("tsv/tables/lvs.tsv", fallback_headers=LVS_HEADERS)
    emit(table)
