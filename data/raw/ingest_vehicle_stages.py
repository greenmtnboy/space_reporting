#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/lvs.html

import pyarrow as pa

from ingest_core import Layout, add_missing_keys, column_keys, emit, ingest_gcat_file
from ingest_launch import LAUNCH_LAYOUT

# Shape as of GCAT release 1.8.5 (2026 Aug 28): 17 columns. TimeOn, TimeOff,
# AltOn, AltOff, VelOn and VelOff (stage ignition/cutoff time, altitude and
# velocity) were added that release and are not populated upstream yet.
LVS_HEADERS = [
    "LV_Name", "LV_Variant", "Stage_No", "Stage_Name", "Qualifier",
    "Dummy", "Multiplicity", "Stage_Impulse", "Stage_Apogee", "Stage_Perigee",
    "Perigee_Qual", "TimeOn", "TimeOff", "AltOn", "AltOff", "VelOn", "VelOff",
]

# Stage_No is deliberately absent: GCAT uses letters for non-numbered positions
# such as 'F' for a fairing.
LVS_LAYOUT = Layout(
    LVS_HEADERS,
    numeric_columns=[
        "Multiplicity", "Stage_Impulse", "Stage_Apogee", "Stage_Perigee",
        "TimeOn", "TimeOff", "AltOn", "AltOff", "VelOn", "VelOff",
    ],
)


def dedupe_stage_positions(table: pa.Table) -> pa.Table:
    """Keep one row per (LV_Name, LV_Variant, Stage_No).

    GCAT can list two objects at the same stage position (e.g. Chang Zheng 2F
    stage F carries both the Fairing and the LES). The model treats stage
    position as the grain, so keep the first row listed for each position.
    """
    names = table.column("LV_Name").to_pylist()
    variants = table.column("LV_Variant").to_pylist()
    stage_nos = table.column("Stage_No").to_pylist()
    seen: set[tuple] = set()
    keep = []
    for key in zip(names, variants, stage_nos):
        keep.append(key not in seen)
        seen.add(key)
    return table.filter(pa.array(keep))


# The placeholder stage a vehicle with no stage rows gets: one stage, position
# 1, of GCAT's own '-' ("Unknown") stage, whose engine is '-'.
VIRTUAL_STAGE = {"Stage_No": "1", "Stage_Name": "-", "Multiplicity": 1}


def vehicle_stages() -> pa.Table:
    """
    GCAT's stage composition, plus a virtual single stage for every vehicle it
    lists none for. lvs_info binds name and variant complete, so it must hold
    every vehicle lv_info and the launches do; a launch whose vehicle has no
    stage rows otherwise drops out of every query that reads its stages.
    """
    # imported here: ingest_vehicle imports this module for LVS_LAYOUT
    from ingest_vehicle import LV_LAYOUT

    lvs = dedupe_stage_positions(ingest_gcat_file("tsv/tables/lvs.tsv", LVS_LAYOUT))
    lv = ingest_gcat_file("tsv/tables/lv.tsv", LV_LAYOUT)
    launch = ingest_gcat_file("tsv/launch/launch.tsv", LAUNCH_LAYOUT)
    return add_missing_keys(
        lvs,
        ["LV_Name", "LV_Variant"],
        column_keys(lv, ["LV_Name", "LV_Variant"])
        | column_keys(launch, ["LV_Type", "Variant"]),
        fill=VIRTUAL_STAGE,
    )


if __name__ == "__main__":
    emit(vehicle_stages())
