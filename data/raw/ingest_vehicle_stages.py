#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/lvs.html

import pyarrow as pa

from ingest_core import documented, emit, ingest_gcat_file

LVS_HEADERS = [
    "LV_Name", "LV_Variant", "Stage_No", "Stage_Name", "Qualifier",
    "Dummy", "Multiplicity", "Stage_Impulse", "Stage_Apogee", "Stage_Perigee",
    "Perigee_Qual",
]

# Stage_No is deliberately absent: GCAT uses letters for non-numbered positions
# such as 'F' for a fairing.
LVS_LAYOUT = documented(
    LVS_HEADERS,
    numeric_columns=["Multiplicity", "Stage_Impulse", "Stage_Apogee", "Stage_Perigee"],
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


if __name__ == "__main__":
    emit(dedupe_stage_positions(ingest_gcat_file("tsv/tables/lvs.tsv", LVS_LAYOUT)))
