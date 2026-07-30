#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/cat/satcat.html

from ingest_core import Layout, emit, ingest_gcat_file

SATCAT_HEADERS = [
    "JCAT", "Satcat", "Launch_Tag", "Piece", "Type", "Name", "PLName",
    "LDate", "Parent", "SDate", "Primary", "DDate", "Status", "Dest",
    "Owner", "State", "Manufacturer", "Bus", "Motor", "Mass", "MassFlag",
    "DryMass", "DryFlag", "TotMass", "TotFlag", "Length", "LFlag",
    "Diameter", "DFlag", "Span", "SpanFlag", "Shape",
    "ODate", "Perigee", "PF", "Apogee", "AF", "Inc", "IF",
    "OpOrbit", "OQUAL", "AltNames",
]

SATCAT_LAYOUT = Layout(
    SATCAT_HEADERS,
    numeric_columns=[
        "Mass", "DryMass", "TotMass", "Length", "Diameter", "Span",
        "Perigee", "Apogee", "Inc",
    ],
)

if __name__ == "__main__":
    emit(ingest_gcat_file("tsv/cat/satcat.tsv", SATCAT_LAYOUT))
