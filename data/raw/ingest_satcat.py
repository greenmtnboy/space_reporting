#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/cat/satcat.html
# Note: All flag columns (MassFlag, DryFlag, TotFlag, LFlag, DFlag, SpanFlag, PF, AF, IF)
# were removed in upstream format change.

from ingest_core import emit, ingest_gcat_file

SATCAT_HEADERS = [
    "JCAT", "Satcat", "Launch_Tag", "Piece", "Type", "Name", "PLName",
    "LDate", "Parent", "SDate", "Primary", "DDate", "Status", "Dest",
    "Owner", "State", "Manufacturer", "Bus", "Motor", "Mass",
    "DryMass", "TotMass", "Length", "Diameter", "Span", "Shape",
    "ODate", "Perigee", "Apogee", "Inc", "OpOrbit", "OQUAL", "AltNames",
]

if __name__ == "__main__":
    table = ingest_gcat_file("tsv/cat/satcat.tsv", fallback_headers=SATCAT_HEADERS)
    emit(table)
