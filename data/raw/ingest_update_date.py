#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests"]
# ///

# Fetches the GCAT data update date from the homepage and emits a single-row table.

from ingest_core import emit, fetch_data_update_date
import pyarrow as pa

if __name__ == "__main__":
    updated_at = fetch_data_update_date()
    table = pa.table(
        {"data_update_date": pa.array([updated_at], type=pa.timestamp("us", tz="UTC"))}
    )
    emit(table)
