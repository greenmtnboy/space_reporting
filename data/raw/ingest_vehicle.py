#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

from ingest_core import emit, ingest_gcat_file

if __name__ == "__main__":
    table = ingest_gcat_file("tsv/tables/lv.tsv")
    emit(table)
