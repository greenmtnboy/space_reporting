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
from typing import Dict, List, Mapping, Sequence

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


@dataclass(frozen=True)
class Layout:
    """
    One shape a GCAT file is known to take on disk.

    GCAT files carry no usable header (we always supply our own names positionally),
    so a field appearing or disappearing upstream silently slides every later column
    sideways without changing the row width. Describing each known shape, together
    with constraints that only hold when the columns line up, lets ingest work out
    which one it actually received.

    numeric_columns are columns we model as numbers; they must parse as numbers.
    blank_columns must be entirely empty - use them to pin filler fields that GCAT
    pads rows out with, since "this field is always empty" is often the only thing
    that distinguishes one candidate shape from another.
    """

    name: str
    headers: List[str]
    numeric_columns: Sequence[str] = ()
    blank_columns: Sequence[str] = ()

    def __post_init__(self) -> None:
        for name in (*self.numeric_columns, *self.blank_columns):
            if name not in self.headers:
                raise ValueError(
                    f"Layout '{self.name}' constrains column '{name}', "
                    f"which is not one of its headers: {self.headers}"
                )

    def misfits(self, rows: Rows) -> List[str]:
        """Reasons this layout does not describe rows. Empty means it fits."""
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
            bad = [r[idx] for r in rows if not is_blank(r[idx]) and not is_numeric(r[idx])]
            if bad:
                problems.append(
                    f"'{name}' (index {idx}) should be numeric but {len(bad)} of "
                    f"{len(rows)} rows hold e.g. {bad[:3]}"
                )
        for name in self.blank_columns:
            idx = self.headers.index(name)
            filled = [r[idx] for r in rows if not is_blank(r[idx])]
            if filled:
                problems.append(
                    f"'{name}' (index {idx}) should be empty filler but {len(filled)} "
                    f"of {len(rows)} rows hold e.g. {filled[:3]}"
                )
        return problems


def documented(
    headers: List[str],
    numeric_columns: Sequence[str] = (),
    blank_columns: Sequence[str] = (),
) -> Layout:
    """The shape GCAT's column documentation describes - always the preferred layout."""
    return Layout("documented", headers, numeric_columns, blank_columns)


def select_layout(layouts: Sequence[Layout], rows: Rows) -> Layout:
    """
    Pick the first layout the data actually fits.

    Layouts are ordered by preference, so the documented shape wins whenever it
    fits and a variant only applies when it does not. GCAT introduces and reverts
    these shifts intermittently, so every shape we have seen has to keep working
    without a code change in either direction.
    """
    layouts = [layouts] if isinstance(layouts, Layout) else list(layouts)
    if not layouts:
        raise ValueError("At least one layout is required")

    reasons: Dict[str, List[str]] = {}
    for layout in layouts:
        problems = layout.misfits(rows)
        if not problems:
            if layout is not layouts[0]:
                print(
                    f"NOTE: GCAT data matches the '{layout.name}' layout rather than "
                    f"'{layouts[0].name}'. Reasons '{layouts[0].name}' was rejected: "
                    f"{reasons[layouts[0].name]}",
                    file=sys.stderr,
                )
            return layout
        reasons[layout.name] = problems

    detail = "\n".join(f"  {name}: {why}" for name, why in reasons.items())
    raise ValueError(
        "No known layout describes this GCAT file; it changed shape in a way "
        f"ingest does not recognise. Add a Layout for the new shape.\n{detail}"
    )


def clean_tsv_content(
    raw_bytes: io.BytesIO, layouts: Layout | Sequence[Layout]
) -> io.BytesIO:
    """
    Clean TSV content by:
    1. Removing comment lines (lines starting with #)
    2. Stripping trailing/leading spaces from all fields
    3. Converting '-' to empty string in numeric columns

    GCAT's own header line is ignored - it has proven unreliable, and column names
    come from the matching Layout instead.
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

    layout = select_layout(layouts, data_rows)
    headers = layout.headers

    # Start from the layout's declared numeric columns, then add any column whose
    # non-'-' values all convert to float. Declared columns are seeded because a
    # column that is empty in this snapshot has nothing to infer from.
    dash_to_empty = {headers.index(name) for name in layout.numeric_columns}
    for col_idx, _ in enumerate(headers):
        non_dash_values = [
            row[col_idx]
            for row in data_rows
            if col_idx < len(row) and row[col_idx] not in ("-", "")
        ]
        if non_dash_values and all(is_numeric(val) for val in non_dash_values):
            dash_to_empty.add(col_idx)

    # Replace '-' with empty string in numeric columns
    for row in data_rows:
        for col_idx in dash_to_empty:
            if col_idx < len(row) and row[col_idx] == "-":
                row[col_idx] = ""

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


def conform(
    table: pa.Table,
    columns: Sequence[str],
    types: Mapping[str, pa.DataType] = {},
) -> pa.Table:
    """
    Project table onto columns, filling absent ones with nulls and casting types.

    Whichever layout we parsed, downstream gets the same column names in the same
    order with the same types, so the published parquet schema does not flip about
    as GCAT breaks and repairs its files. Declare a type for any column that a
    known layout can omit; an all-null column has no type to infer.
    """
    arrays = []
    for name in columns:
        target = types.get(name)
        if name in table.column_names:
            column = table.column(name)
        else:
            column = pa.nulls(table.num_rows, type=target or pa.string())
        if target is not None and column.type != target:
            column = column.cast(target)
        arrays.append(column)
    return pa.table(arrays, names=list(columns))


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


def ingest_gcat_file(file_path: str, layouts: Layout | Sequence[Layout]) -> pa.Table:
    """
    Download a single file from GCAT and return it as an Arrow table.

    Args:
        file_path: Relative path to the file, e.g. 'tsv/cat/lcat.tsv'
        layouts: Known shapes for the file, most preferred first, or a single
            Layout where only one shape has ever been seen. The first one the
            data fits is used; if none fit, ingest fails rather than publishing
            columns that have slid out of alignment.

    Returns:
        PyArrow Table named by the matching layout. Pass it through conform() if
        more than one layout is possible, so the output schema stays fixed.
    """
    raw_bytes = download_tsv(file_path)
    cleaned_bytes = clean_tsv_content(raw_bytes, layouts)
    return load_arrow_table(cleaned_bytes)
