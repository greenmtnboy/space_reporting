#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# No HTML reference available for launch.tsv (TSV only).
# Column reference: https://planet4589.org/space/gcat/web/launch/lcols.html
# Verified against downloaded TSV: 28 columns.
# Changes from preql: LDate added (field 3, human-readable date), RangeFlag restored,
# Apoflag kept. Dest moved to after RangeFlag. Group added after FailCode.

import pyarrow as pa

from ingest_core import Layout, conform, emit, ingest_gcat_file

LAUNCH_HEADERS = [
    "launch_tag", "launch_jd", "LDate", "LV_Type", "Variant", "Flight_ID",
    "Flight", "Mission", "FlightCode", "Platform", "Launch_Site", "Launch_Pad",
    "Ascent_Site", "Ascent_Pad", "Apogee", "Apoflag", "Range", "RangeFlag",
    "Dest", "OrbPay", "Agency", "LaunchCode", "FailCode", "Group",
    "Category", "LTCite", "Cite", "Notes",
]

# Columns the model reads as numbers. Declaring them is what distinguishes a
# correctly aligned file from a shifted one - row widths match either way.
LAUNCH_NUMERIC_COLUMNS = ["launch_jd", "Apogee", "Range", "OrbPay"]

DOCUMENTED = Layout(
    name="documented",
    headers=LAUNCH_HEADERS,
    numeric_columns=LAUNCH_NUMERIC_COLUMNS,
)

# GCAT release 1.8.3 (2026 Jul 25) stopped emitting OrbPay values in launch.tsv
# data rows while leaving OrbPay in the header. Rows are padded back out to 28
# fields with a trailing filler, so everything from Agency onward sits one column
# to the left: agency codes land in orb_pay, launch codes in orgs, and so on.
# Nothing about the row width gives that away, hence the value constraints.
MISSING_ORB_PAY = Layout(
    name="missing-orbpay",
    headers=[c for c in LAUNCH_HEADERS if c != "OrbPay"] + ["_filler"],
    numeric_columns=[c for c in LAUNCH_NUMERIC_COLUMNS if c != "OrbPay"],
    blank_columns=["_filler"],
)

# Most preferred first: the documented shape wins whenever the data fits it, so
# this reverts to normal by itself if GCAT starts emitting OrbPay again.
LAUNCH_LAYOUTS = [DOCUMENTED, MISSING_ORB_PAY]

# OrbPay is absent under MISSING_ORB_PAY, so it has no type to infer. Pin it to
# keep the published parquet schema identical under either layout.
LAUNCH_COLUMN_TYPES = {"OrbPay": pa.float64()}

if __name__ == "__main__":
    table = ingest_gcat_file("tsv/launch/launch.tsv", LAUNCH_LAYOUTS)
    emit(conform(table, LAUNCH_HEADERS, LAUNCH_COLUMN_TYPES))
