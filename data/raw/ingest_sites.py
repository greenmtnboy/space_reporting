#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/sites.html

from ingest_core import Layout, emit, ingest_gcat_file

SITES_HEADERS = [
    "Site", "Code", "UCode", "Type", "StateCode", "TStart", "TStop",
    "ShortName", "Name", "Location", "Longitude", "Latitude", "Error",
    "Parent", "ShortEName", "EName", "Group", "UName",
]

SITES_LAYOUT = Layout(
    SITES_HEADERS, numeric_columns=["Longitude", "Latitude", "Error"]
)

if __name__ == "__main__":
    emit(ingest_gcat_file("tsv/tables/sites.tsv", SITES_LAYOUT))
