#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/orgs.html

from ingest_core import Layout, emit, ingest_gcat_file

ORGS_HEADERS = [
    "Code", "UCode", "StateCode", "Type", "Class", "TStart", "TStop",
    "ShortName", "Name", "Location", "Longitude", "Latitude", "Error",
    "Parent", "ShortEName", "EName", "UName",
]

ORGS_LAYOUT = Layout(
    ORGS_HEADERS, numeric_columns=["Longitude", "Latitude", "Error"]
)

if __name__ == "__main__":
    emit(ingest_gcat_file("tsv/tables/orgs.tsv", ORGS_LAYOUT))
