#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/platforms.html

from ingest_core import emit, ingest_gcat_file

PLATFORMS_HEADERS = [
    "Code", "UCode", "StateCode", "Type", "Class", "TStart", "TStop",
    "ShortName", "Name", "Location", "Longitude", "Latitude", "Error",
    "Parent", "ShortEName", "EName", "VClass", "VClassID", "VID", "Group", "UName",
]

if __name__ == "__main__":
    table = ingest_gcat_file("tsv/tables/platforms.tsv", fallback_headers=PLATFORMS_HEADERS)
    emit(table)
