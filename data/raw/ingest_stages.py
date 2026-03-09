#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/stages.html

from ingest_core import emit, ingest_gcat_file

STAGES_HEADERS = [
    "Stage_Name", "Stage_Family", "Stage_Manufacturer", "Stage_Alt_Name",
    "Length", "Diameter", "Launch_Mass", "Dry_Mass", "Thrust", "Duration",
    "Engine", "NEng",
]

if __name__ == "__main__":
    table = ingest_gcat_file("tsv/tables/stages.tsv", fallback_headers=STAGES_HEADERS)
    emit(table)
