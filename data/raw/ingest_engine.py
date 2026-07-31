#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/engines.html

from ingest_core import Layout, emit, ingest_gcat_file

ENGINES_HEADERS = [
    "Name", "Manufacturer", "Family", "Alt_Name", "Oxidizer", "Fuel",
    "Mass", "MFlag", "Impulse", "ImpFlag", "Thrust", "TFlag",
    "Isp", "IspFlag", "Duration", "DurFlag", "Chambers",
    "Date", "Usage", "Group",
]

ENGINES_LAYOUT = Layout(
    ENGINES_HEADERS,
    numeric_columns=["Mass", "Impulse", "Thrust", "Isp", "Duration", "Chambers"],
)

if __name__ == "__main__":
    emit(ingest_gcat_file("tsv/tables/engines.tsv", ENGINES_LAYOUT))
