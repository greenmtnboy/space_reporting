#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/orgs.html

from ingest_core import emit, ingest_gcat_file

ORGS_HEADERS = [
    "Code", "UCode", "StateCode", "Type", "Class", "TStart", "TStop",
    "ShortName", "Name", "Location", "Longitude", "Latitude", "Error",
    "Parent", "ShortEName", "EName", "UName",
]

if __name__ == "__main__":
    table = ingest_gcat_file("tsv/tables/orgs.tsv", fallback_headers=ORGS_HEADERS)
    emit(table)
