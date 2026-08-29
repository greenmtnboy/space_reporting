#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests", "pytz"]
# ///

import csv
import io
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Sequence

import pyarrow as pa
import pyarrow.csv as pv
import requests

BASE_URL = "https://planet4589.org/space/gcat/"
GCAT_HOME_URL = "https://planet4589.org/space/gcat/"

ENCODING = "utf-8"

Rows = List[List[str]]


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


def is_blank(value: str) -> bool:
    """GCAT writes both '' and '-' for 'no value'."""
    return value.strip() in ("", "-")


def is_numeric(value: str) -> bool:
    try:
        float(value)
    except ValueError:
        return False
    return True


def strip_numeric_qualifier(value: str) -> str:
    """
    GCAT suffixes some numeric values with a qualifier character instead of a
    separate flag column: '?' for an estimate (e.g. '1650.0?'), plus rare '-'
    and 's' suffixes (e.g. '0-', '650.0s'). Return the bare number for such a
    value; anything else comes back unchanged, so a slid column of text still
    fails the numeric check.
    """
    trimmed = value.rstrip("?-s")
    return trimmed if trimmed != value and is_numeric(trimmed) else value


@dataclass(frozen=True)
class Layout:
    """
    The shape we expect a GCAT file to have on disk.

    GCAT files carry no usable header, so we name columns positionally. That makes
    an upstream field being added or dropped dangerous: it slides every later
    column sideways, and where the row width is padded back out nothing about the
    row shape gives it away. The columns still parse, so corrupt-but-plausible
    strings land in the model.

    numeric_columns are the columns we model as numbers. Checking their values is
    what catches a slide, since a shifted file puts text where numbers belong.
    """

    headers: List[str]
    numeric_columns: Sequence[str] = ()

    def __post_init__(self) -> None:
        for name in self.numeric_columns:
            if name not in self.headers:
                raise ValueError(
                    f"Layout constrains column '{name}', which is not one of its "
                    f"headers: {self.headers}"
                )

    def misfits(self, rows: Rows) -> List[str]:
        """Reasons the data does not match this layout. Empty means it fits."""
        width = len(self.headers)
        wrong_width = [idx for idx, row in enumerate(rows) if len(row) != width]
        if wrong_width:
            first = wrong_width[0]
            return [
                f"{len(wrong_width)} of {len(rows)} rows are not {width} fields wide "
                f"(row {first} has {len(rows[first])})"
            ]

        problems = []
        for name in self.numeric_columns:
            idx = self.headers.index(name)
            bad = [
                r[idx]
                for r in rows
                if not is_blank(r[idx])
                and not is_numeric(strip_numeric_qualifier(r[idx]))
            ]
            if bad:
                problems.append(
                    f"'{name}' (index {idx}) should be numeric but {len(bad)} of "
                    f"{len(rows)} rows hold e.g. {bad[:3]}"
                )
        return problems


def clean_tsv_content(raw_bytes: io.BytesIO, layout: Layout) -> io.BytesIO:
    """
    Clean TSV content by:
    1. Removing comment lines (lines starting with #)
    2. Stripping trailing/leading spaces from all fields
    3. Converting '-' to empty string in numeric columns
    4. Stripping GCAT's inline qualifier suffixes ('1650.0?' -> '1650.0') in
       numeric columns

    GCAT's own header line is ignored - it has proven unreliable, and column names
    come from the layout instead. Data that does not match the layout raises rather
    than being published with its columns out of alignment.
    """
    raw_bytes.seek(0)
    lines = raw_bytes.read().decode(ENCODING, errors="replace").splitlines()

    if not lines:
        return io.BytesIO()

    # Parse data rows and strip whitespace
    data_rows: Rows = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        row_reader = csv.reader(io.StringIO(line), delimiter="\t")
        data_rows.append([field.strip() for field in next(row_reader)])

    problems = layout.misfits(data_rows)
    if problems:
        detail = "\n".join(f"  - {why}" for why in problems)
        raise ValueError(
            "GCAT data does not match the expected layout, so its columns can no "
            "longer be trusted to line up. Refusing to publish it; update the "
            f"Layout to match the new upstream shape.\n{detail}"
        )

    headers = layout.headers

    # Start from the layout's declared numeric columns, then add any column whose
    # non-'-' values all convert to float. Declared columns are seeded because a
    # column that is empty in this snapshot has nothing to infer from.
    dash_to_empty = {headers.index(name) for name in layout.numeric_columns}
    for col_idx, _ in enumerate(headers):
        non_dash_values = [
            row[col_idx] for row in data_rows if row[col_idx] not in ("-", "")
        ]
        if non_dash_values and all(
            is_numeric(strip_numeric_qualifier(val)) for val in non_dash_values
        ):
            dash_to_empty.add(col_idx)

    # Replace '-' with empty string and drop qualifier suffixes in numeric columns
    for row in data_rows:
        for col_idx in dash_to_empty:
            row[col_idx] = (
                "" if row[col_idx] == "-" else strip_numeric_qualifier(row[col_idx])
            )

    # Write cleaned TSV to buffer
    out = io.StringIO()
    writer = csv.writer(out, delimiter="\t")
    writer.writerows([headers, *data_rows])

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


def ingest_gcat_file(file_path: str, layout: Layout) -> pa.Table:
    """
    Download a single file from GCAT and return it as an Arrow table.

    Args:
        file_path: Relative path to the file, e.g. 'tsv/cat/lcat.tsv'
        layout: The expected shape. Data that does not match it fails the ingest
            rather than being published with misaligned columns.

    Returns:
        PyArrow Table with the layout's column names.
    """
    raw_bytes = download_tsv(file_path)
    try:
        cleaned_bytes = clean_tsv_content(raw_bytes, layout)
    except ValueError as exc:
        raise ValueError(f"{BASE_URL}{file_path}: {exc}") from exc
    return load_arrow_table(cleaned_bytes)
