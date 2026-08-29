#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# No HTML reference available for launch.tsv (TSV only).
# Column reference: https://planet4589.org/space/gcat/web/launch/lcols.html
# Shape as of GCAT release 1.8.5 (2026 Aug 28): 33 columns. Fairing was added
# that release; Perigee, Inc, Azimuth and OrbMass were added in 1.8.4 and are
# not populated upstream yet.
# Our names differ from GCAT's in one place: GCAT's Launch_Date is our LDate.

from ingest_core import Layout, emit, ingest_gcat_file

LAUNCH_HEADERS = [
    "launch_tag", "launch_jd", "LDate", "LV_Type", "Variant", "Fairing",
    "Flight_ID", "Flight", "Mission", "FlightCode", "Platform", "Launch_Site",
    "Launch_Pad", "Ascent_Site", "Ascent_Pad", "Perigee", "Apogee", "Apoflag", "Inc",
    "Azimuth", "Range", "RangeFlag", "Dest", "OrbMass", "OrbPay", "Agency",
    "LaunchCode", "FailCode", "Group", "Category", "LTCite", "Cite", "Notes",
]

# OrbPay is the important one here. GCAT dropped it from data rows in release 1.8.3
# while leaving it in the header, which padded rows back to width and slid agency
# codes into orb_pay and launch codes into orgs - all of it plausible strings that
# published without complaint. Checking these values is what stops that recurring.
LAUNCH_LAYOUT = Layout(
    LAUNCH_HEADERS,
    numeric_columns=[
        "launch_jd", "Perigee", "Apogee", "Inc", "Azimuth", "Range",
        "OrbMass", "OrbPay",
    ],
)

if __name__ == "__main__":
    emit(ingest_gcat_file("tsv/launch/launch.tsv", LAUNCH_LAYOUT))
