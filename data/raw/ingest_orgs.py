#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Column reference: https://planet4589.org/space/gcat/data/tables/orgs.html

from ingest_core import Layout, add_missing_keys, column_keys, emit, ingest_gcat_file
from ingest_engine import ENGINES_LAYOUT
from ingest_launch import LAUNCH_LAYOUT
from ingest_satcat import SATCAT_LAYOUT
from ingest_vehicle import LV_LAYOUT

ORGS_HEADERS = [
    "Code", "UCode", "StateCode", "Type", "Class", "TStart", "TStop",
    "ShortName", "Name", "Location", "Longitude", "Latitude", "Error",
    "Parent", "ShortEName", "EName", "UName",
]

ORGS_LAYOUT = Layout(
    ORGS_HEADERS, numeric_columns=["Longitude", "Latitude", "Error"]
)



def first_code(codes: str) -> str:
    """Mirrors etl.preql's first_code."""
    return codes.split("/")[0]


def referenced_orgs() -> set:
    """Every org code a fact table holds, as the model binds it to code."""
    launch = ingest_gcat_file("tsv/launch/launch.tsv", LAUNCH_LAYOUT)
    satcat = ingest_gcat_file("tsv/cat/satcat.tsv", SATCAT_LAYOUT)
    engines = ingest_gcat_file("tsv/tables/engines.tsv", ENGINES_LAYOUT)
    lv = ingest_gcat_file("tsv/tables/lv.tsv", LV_LAYOUT)
    return (
        # the models join a slash-joined list ('AFSSD/MSC') on its first code
        column_keys(launch, ["Agency"], first_code)
        | column_keys(satcat, ["Owner"], first_code)
        | column_keys(satcat, ["State"])
        | column_keys(satcat, ["Manufacturer"], first_code)
        | column_keys(engines, ["Manufacturer"], first_code)
        | column_keys(lv, ["LV_Manufacturer"], first_code)
    )


if __name__ == "__main__":
    orgs = ingest_gcat_file("tsv/tables/orgs.tsv", ORGS_LAYOUT)
    emit(
        add_missing_keys(
            orgs,
            ["Code"],
            referenced_orgs(),
            label_columns=["ShortName", "Name", "UName"],
        )
    )
