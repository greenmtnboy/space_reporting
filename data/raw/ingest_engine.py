#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/engines.html

from ingest_core import emit, ingest_gcat_file

ENGINES_HEADERS = [
    "Name", "Manufacturer", "Family", "Alt_Name", "Oxidizer", "Fuel",
    "Mass", "Impulse", "Thrust", "Isp", "Duration", "Chambers",
    "Date", "Usage", "Group",
]

if __name__ == "__main__":
    table = ingest_gcat_file("tsv/tables/engines.tsv", fallback_headers=ENGINES_HEADERS)
    emit(table)
