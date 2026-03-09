#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# No HTML reference available for launch.tsv (TSV only).
# Verified against downloaded TSV: 26 columns.
# Changes from preql: LDate added (field 3, human-readable date), RangeFlag removed,
# Apoflag kept. Dest appears after FailCode in actual TSV order.

from ingest_core import emit, ingest_gcat_file

LAUNCH_HEADERS = [
    "launch_tag", "launch_jd", "LDate", "LV_Type", "Variant", "Flight_ID",
    "Flight", "Mission", "FlightCode", "Platform", "Launch_Site", "Launch_Pad",
    "Ascent_Site", "Ascent_Pad", "Apogee", "Apoflag", "Range",
    "OrbPay", "Agency", "LaunchCode", "FailCode", "Dest",
    "Category", "LTCite", "Cite", "Notes",
]

if __name__ == "__main__":
    table = ingest_gcat_file("tsv/launch/launch.tsv", fallback_headers=LAUNCH_HEADERS)
    emit(table)
