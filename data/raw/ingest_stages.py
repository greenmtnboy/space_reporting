#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/stages.html

from ingest_core import Layout, emit, ingest_gcat_file

# Shape as of GCAT release 1.8.8 (2026 Sep 3): 20 columns. The estimate
# qualifier that used to ride along inside a measurement ('1650.0?') now has its
# own column after each of Length, Diameter, Launch_Mass, Dry_Mass, Thrust and
# ThrustSL, which widened the file from 14 columns to 20. Duration keeps no
# flag column. The HTML column reference still renders the qualifier inline, so
# it shows 14 columns; the TSV header is what these names follow.
STAGES_HEADERS = [
    "Stage_Name", "Stage_Family", "Stage_Manufacturer", "Stage_Alt_Name",
    "Length", "Length_Flag", "Diameter", "Diameter_Flag",
    "Launch_Mass", "Launch_Mass_Flag", "Dry_Mass", "Dry_Mass_Flag",
    "Thrust", "Thrust_Flag", "ThrustSL", "ThrustSL_Flag",
    "Duration", "Engine", "NEng", "Class",
]

STAGES_LAYOUT = Layout(
    STAGES_HEADERS,
    numeric_columns=[
        "Length", "Diameter", "Launch_Mass", "Dry_Mass", "Thrust", "ThrustSL",
        "Duration", "NEng",
    ],
)

if __name__ == "__main__":
    emit(ingest_gcat_file("tsv/tables/stages.tsv", STAGES_LAYOUT))
