#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/stages.html

from ingest_core import Layout, emit, ingest_gcat_file

# Shape as of GCAT release 1.8.5 (2026 Aug 28): 14 columns. ThrustSL (sea-level
# thrust) and Class were added that release.
STAGES_HEADERS = [
    "Stage_Name", "Stage_Family", "Stage_Manufacturer", "Stage_Alt_Name",
    "Length", "Diameter", "Launch_Mass", "Dry_Mass", "Thrust", "ThrustSL",
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
