#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests", "pytz"]
# ///

import csv
import io
import re
import sys
from datetime import datetime, timezone
from typing import List

import pyarrow as pa
import pyarrow.csv as pv
import requests

BASE_URL = "https://planet4589.org/space/gcat/"
GCAT_HOME_URL = "https://planet4589.org/space/gcat/"

ENCODING = "utf-8"


def fetch_data_update_date() -> datetime:
    """
    Fetch the 'Data Update' date from the GCAT homepage.
    Example format: "Data Update 2026 Jan 2"
    """
    r = requests.get(GCAT_HOME_URL)
    r.raise_for_status()

    # Look for pattern like "Data Update 2026 Jan 2"
    match = re.search(r"Data\s+Update\s+(\d{4})\s+(\w{3})\s+(\d{1,2})", r.text)
    if not match:
        raise RuntimeError("Could not find 'Data Update' date on GCAT homepage")

    year, month_abbr, day = match.groups()

    # Parse the date
    date_str = f"{year} {month_abbr} {day}"
    dt = datetime.strptime(date_str, "%Y %b %d")
    return dt.replace(tzinfo=timezone.utc)


def download_tsv(file_path: str) -> io.BytesIO:
    """
    Download a TSV file from GCAT.
    file_path should be relative, e.g. 'tsv/cat/lcat.tsv'
    """
    url = BASE_URL + file_path
    r = requests.get(url, stream=True)
    r.raise_for_status()

    buf = io.BytesIO()
    for chunk in r.iter_content(chunk_size=1024 * 1024):
        if chunk:
            buf.write(chunk)
    buf.seek(0)
    return buf


def clean_tsv_content(raw_bytes: io.BytesIO) -> io.BytesIO:
    """
    Clean TSV content by:
    1. Removing comment lines (lines starting with #) except the first line
    2. Stripping trailing/leading spaces from all fields
    3. Converting '-' to empty string in numeric columns
    """
    raw_bytes.seek(0)
    lines = raw_bytes.read().decode(ENCODING, errors="replace").splitlines()

    if not lines:
        return io.BytesIO()

    # Process header - always use first line, strip # if present
    header_line = lines[0].lstrip("#").strip()

    # Collect non-comment data lines
    data_lines = []
    for line in lines[1:]:
        if not line.strip().startswith("#"):
            data_lines.append(line.strip())

    # Parse with CSV reader to handle fields properly
    all_rows: List[List[str]] = []

    # Parse header
    header_reader = csv.reader(io.StringIO(header_line), delimiter="\t")
    headers = [col.strip() for col in next(header_reader)]
    all_rows.append(headers)

    # Parse data rows and strip whitespace
    for line in data_lines:
        if line:  # Skip empty lines
            row_reader = csv.reader(io.StringIO(line), delimiter="\t")
            row = [field.strip() for field in next(row_reader)]
            all_rows.append(row)

    if len(all_rows) <= 1:  # Only header, no data
        out = io.StringIO()
        writer = csv.writer(out, delimiter="\t")
        writer.writerows(all_rows)
        return io.BytesIO(out.getvalue().encode(ENCODING))

    # Identify numeric columns (columns where all non-'-' values can be converted to float)
    numeric_columns = set()
    for col_idx, _ in enumerate(headers):
        non_dash_values = []
        for row in all_rows[1:]:  # Skip header
            if col_idx < len(row) and row[col_idx] != "-" and row[col_idx] != "":
                non_dash_values.append(row[col_idx])
        if non_dash_values:
            try:
                for val in non_dash_values:
                    float(val)
                numeric_columns.add(col_idx)
            except ValueError:
                pass

    # Replace '-' with empty string in numeric columns
    for row in all_rows[1:]:
        for col_idx in numeric_columns:
            if col_idx < len(row) and row[col_idx] == "-":
                row[col_idx] = ""

    # Write cleaned TSV to buffer
    out = io.StringIO()
    writer = csv.writer(out, delimiter="\t")
    writer.writerows(all_rows)

    return io.BytesIO(out.getvalue().encode(ENCODING))


def load_arrow_table(tsv_bytes: io.BytesIO) -> pa.Table:
    """Load TSV content into a PyArrow table."""
    tsv_bytes.seek(0)
    return pv.read_csv(
        tsv_bytes,
        parse_options=pv.ParseOptions(delimiter="\t"),
        convert_options=pv.ConvertOptions(strings_can_be_null=True),
    )


def add_data_update_column(table: pa.Table, updated_at: datetime) -> pa.Table:
    """Add a 'data_update_date' column to the table."""
    n = table.num_rows

    ts_array = pa.array(
        [updated_at] * n,
        type=pa.timestamp("us", tz="UTC"),
    )

    return table.append_column("data_update_date", ts_array)


def emit(table: pa.Table) -> None:
    """Write the table to stdout as Arrow IPC stream."""
    with pa.ipc.new_stream(sys.stdout.buffer, table.schema) as writer:
        writer.write_table(table)


def ingest_gcat_file(file_path: str) -> pa.Table:
    """
    Download a single file from GCAT and return it as an Arrow table.

    Args:
        file_path: Relative path to the file, e.g. 'tsv/cat/lcat.tsv'

    Returns:
        PyArrow Table with the data and a 'data_update_date' column
    """
    data_update_date = fetch_data_update_date()
    raw_bytes = download_tsv(file_path)
    cleaned_bytes = clean_tsv_content(raw_bytes)
    table = load_arrow_table(cleaned_bytes)
    table = add_data_update_column(table, data_update_date)
    return table


