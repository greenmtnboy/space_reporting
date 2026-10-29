#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/platforms.html

from ingest_core import Layout, add_missing_keys, column_keys, emit, ingest_gcat_file
from ingest_launch import LAUNCH_LAYOUT

PLATFORMS_HEADERS = [
    "Code", "UCode", "StateCode", "Type", "Class", "TStart", "TStop",
    "ShortName", "Name", "Location", "Longitude", "Latitude", "Error",
    "Parent", "ShortEName", "EName", "VClass", "VClassID", "VID", "Group", "UName",
]

# Longitude and Latitude are currently unpopulated upstream, so they constrain
# nothing; they are declared so they still parse as numbers if GCAT fills them in.
PLATFORMS_LAYOUT = Layout(
    PLATFORMS_HEADERS,
    numeric_columns=["Longitude", "Latitude", "Error"],
    string_columns=["TStart", "TStop"],
)

if __name__ == "__main__":
    platforms = ingest_gcat_file("tsv/tables/platforms.tsv", PLATFORMS_LAYOUT)
    launch = ingest_gcat_file("tsv/launch/launch.tsv", LAUNCH_LAYOUT)
    emit(
        add_missing_keys(
            platforms,
            ["Code"],
            column_keys(launch, ["Platform"]),
            label_columns=["ShortName", "Name", "UName"],
        )
    )
