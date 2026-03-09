#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/lv.html
# Note: LV_Min_Stage and LV_Max_Stage appear as single "LV_L" column in HTML display.

from ingest_core import emit, ingest_gcat_file

LV_HEADERS = [
    "LV_Name", "LV_Family", "LV_Manufacturer", "LV_Variant", "LV_Alias",
    "LV_Min_Stage", "LV_Max_Stage", "Length", "Diameter", "Launch_Mass",
    "LEO_Capacity", "GTO_Capacity", "TO_Thrust", "Class", "Apogee", "Range",
]

if __name__ == "__main__":
    table = ingest_gcat_file("tsv/tables/lv.tsv", fallback_headers=LV_HEADERS)
    emit(table)
