#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/lv.html
# Note: LV_Min_Stage and LV_Max_Stage appear as single "LV_L" column in HTML display.

from ingest_core import Layout, add_missing_keys, column_keys, emit, ingest_gcat_file
from ingest_launch import LAUNCH_LAYOUT
from ingest_vehicle_stages import LVS_LAYOUT

# Shape as of GCAT release 1.8.5 (2026 Aug 28): 20 columns. GenericName was
# added that release.
LV_HEADERS = [
    "LV_Name", "LV_Family", "LV_Manufacturer", "LV_Variant", "LV_Alias",
    "LV_Min_Stage", "LV_Max_Stage", "Length", "LFlag", "Diameter", "DFlag",
    "Launch_Mass", "MFlag", "LEO_Capacity", "GTO_Capacity", "TO_Thrust",
    "Class", "Apogee", "Range", "GenericName",
]

LV_LAYOUT = Layout(
    LV_HEADERS,
    numeric_columns=[
        "LV_Min_Stage", "LV_Max_Stage", "Length", "Diameter", "Launch_Mass",
        "LEO_Capacity", "GTO_Capacity", "TO_Thrust", "Apogee", "Range",
    ],
)

if __name__ == "__main__":
    lv = ingest_gcat_file("tsv/tables/lv.tsv", LV_LAYOUT)
    launch = ingest_gcat_file("tsv/launch/launch.tsv", LAUNCH_LAYOUT)
    lvs = ingest_gcat_file("tsv/tables/lvs.tsv", LVS_LAYOUT)
    emit(
        add_missing_keys(
            lv,
            ["LV_Name", "LV_Variant"],
            column_keys(launch, ["LV_Type", "Variant"])
            | column_keys(lvs, ["LV_Name", "LV_Variant"]),
        )
    )
