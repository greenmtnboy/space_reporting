#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = ["pyarrow", "requests", "pytz"]
# ///

import csv
import io
import os
import re
import shutil
import sys
import tempfile
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Iterator, List, Sequence, Set, Tuple

import pyarrow as pa
import pyarrow.csv as pv
import requests

BASE_URL = "https://planet4589.org/space/gcat/"
GCAT_HOME_URL = "https://planet4589.org/space/gcat/"

ENCODING = "utf-8"

Rows = List[List[str]]


# GCAT is one person's site, and a refresh runs every ingest script as its own
# process: the dimension ingests read the fact files too, so without a cache one
# refresh would fetch launch.tsv five times. Every script instead goes through
# a local cache keyed by GCAT's "Data Update" date, so each file is fetched once
# per upstream release, and every script in a run reads the same bytes.
CACHE_DIR = Path(
    os.environ.get("GCAT_CACHE_DIR", Path(tempfile.gettempdir()) / "gcat_cache")
)
# How long one homepage read of the update date is trusted. Long enough to span
# a whole refresh, so every script in it agrees on the date (and so on the
# files); short enough that the next day's refresh sees a new release.
UPDATE_DATE_TTL_SECONDS = 30 * 60


@contextmanager
def cache_lock(name: str) -> Iterator[None]:
    """
    Serialize cache fills across the refresh's parallel scripts, so two that
    need the same file do not both fetch it. Without fcntl (Windows) this only
    costs a duplicate fetch; writes are atomic either way.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(CACHE_DIR / f"{name}.lock", "w") as handle:
        try:
            import fcntl
        except ImportError:
            yield
            return
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(f"{path.name}.{os.getpid()}.partial")
    partial.write_bytes(data)
    os.replace(partial, path)


def parse_data_update_date(html: str) -> datetime:
    """
    The 'Data Update' date on the GCAT homepage.
    Example format: "Data Update 2026 Jan 2"
    """
    match = re.search(r"Data\s+Update\s+(\d{4})\s+(\w{3})\s+(\d{1,2})", html)
    if not match:
        raise RuntimeError("Could not find 'Data Update' date on GCAT homepage")

    year, month_abbr, day = match.groups()
    dt = datetime.strptime(f"{year} {month_abbr} {day}", "%Y %b %d")
    # naive UTC: the model types the update date as a datetime, and an
    # offset-carrying value reads back as a TIMESTAMP instead
    return dt


def fetch_data_update_date() -> datetime:
    """GCAT's 'Data Update' date, read from the homepage at most once per TTL."""
    cached = CACHE_DIR / "data_update_date"
    with cache_lock("data_update_date"):
        if cached.exists() and time.time() - cached.stat().st_mtime < (
            UPDATE_DATE_TTL_SECONDS
        ):
            return datetime.fromisoformat(cached.read_text()).replace(tzinfo=None)
        r = requests.get(GCAT_HOME_URL)
        r.raise_for_status()
        updated_at = parse_data_update_date(r.text)
        write_atomic(cached, updated_at.isoformat().encode())
        return updated_at


def download_tsv(file_path: str) -> io.BytesIO:
    """
    A TSV file from GCAT, fetched at most once per upstream release.
    file_path should be relative, e.g. 'tsv/cat/lcat.tsv'
    """
    release = fetch_data_update_date().date().isoformat()
    cached = CACHE_DIR / release / file_path
    with cache_lock(file_path.replace("/", "_")):
        if not cached.exists():
            r = requests.get(BASE_URL + file_path, stream=True)
            r.raise_for_status()
            buf = io.BytesIO()
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    buf.write(chunk)
            write_atomic(cached, buf.getvalue())
            prune_old_releases(keep=release)
        return io.BytesIO(cached.read_bytes())


def prune_old_releases(keep: str) -> None:
    """Drop cached files from earlier GCAT releases; nothing reads them again."""
    for entry in CACHE_DIR.iterdir():
        if entry.is_dir() and entry.name != keep:
            shutil.rmtree(entry, ignore_errors=True)


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


def strip_code_qualifier(value: str) -> str:
    """'USAF?' -> 'USAF', 'RAYM?/GSFC' -> 'RAYM/GSFC', a bare '?' -> '-'."""
    if "?" not in value:
        return value
    return value.replace("?", "").strip() or "-"


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
    # Columns holding codes that point at another GCAT table. GCAT marks an
    # uncertain attribution with '?' ('USAF?', 'RAYM?/GSFC', variant '?'); the
    # mark is dropped so the code matches the table it points at, and a code
    # that was only a '?' becomes '-' (no value).
    code_columns: Sequence[str] = ()
    # Columns the model types as text that can still look numeric (a start
    # year, '1965'); read as strings rather than inferred.
    string_columns: Sequence[str] = ()

    def __post_init__(self) -> None:
        for name in [*self.numeric_columns, *self.code_columns, *self.string_columns]:
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
    5. Stripping the '?' uncertainty mark from code columns ('USAF?' -> 'USAF')

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
        for name in layout.code_columns:
            idx = headers.index(name)
            row[idx] = strip_code_qualifier(row[idx])

    # Write cleaned TSV to buffer
    out = io.StringIO()
    writer = csv.writer(out, delimiter="\t")
    writer.writerows([headers, *data_rows])

    return io.BytesIO(out.getvalue().encode(ENCODING))


def load_arrow_table(tsv_bytes: io.BytesIO, layout: Layout) -> pa.Table:
    """Load TSV content into a PyArrow table."""
    tsv_bytes.seek(0)
    return pv.read_csv(
        tsv_bytes,
        parse_options=pv.ParseOptions(delimiter="\t"),
        convert_options=pv.ConvertOptions(
            strings_can_be_null=True,
            column_types={name: pa.string() for name in layout.string_columns},
        ),
    )


def add_data_update_column(table: pa.Table, updated_at: datetime) -> pa.Table:
    """Add a 'data_update_date' column to the table."""
    n = table.num_rows

    ts_array = pa.array(
        [updated_at] * n,
        type=pa.timestamp("us"),
    )

    return table.append_column("data_update_date", ts_array)


Key = Tuple[str, ...]


def column_keys(
    table: pa.Table,
    columns: Sequence[str],
    transform: Callable[[str], str] = lambda v: v,
) -> Set[Key]:
    """
    The distinct keys a fact table holds in `columns`, as tuples of strings.
    `transform` maps each value first, e.g. to take the first of a slash-joined
    list of codes. Rows with a null or empty part are skipped: they reference
    nothing.
    """
    parts = [table.column(name).to_pylist() for name in columns]
    keys: Set[Key] = set()
    for row in zip(*parts):
        if any(value is None for value in row):
            continue
        key = tuple(transform(str(value)) for value in row)
        if all(key):
            keys.add(key)
    return keys


def add_missing_keys(
    table: pa.Table,
    key_columns: Sequence[str],
    referenced: Iterable[Key],
    label_columns: Sequence[str] = (),
    fill: Dict[str, Any] | None = None,
) -> pa.Table:
    """
    Append a placeholder row for every key the fact tables reference that this
    dimension table lacks.

    GCAT's fact files cite codes its own dimension files do not list - uncertain
    attributions ('USAF?'), joint ones ('AFSSD/MSC'), retired vehicle variants.
    The model binds each dimension as complete, so a query that reads one of
    those codes through the dimension silently drops the fact rows holding it.
    Placeholders keep the dimension a superset of every code the facts hold.

    A placeholder carries GCAT's own '-' ("no value") in its string columns and
    null in the rest; `label_columns` get the key itself, so the row still has a
    readable name. With several key columns the label is the first. `fill`
    sets a constant for a column instead, for a table whose grain is wider than
    the key being padded.
    """
    fill = fill or {}
    present = column_keys(table, key_columns)
    missing = sorted(set(referenced) - present)
    if not missing:
        return table

    columns = {}
    for field in table.schema:
        if field.name in key_columns:
            idx = list(key_columns).index(field.name)
            values = [key[idx] for key in missing]
            columns[field.name] = pa.array(values, type=pa.string()).cast(field.type)
        elif field.name in fill:
            columns[field.name] = pa.array(
                [fill[field.name]] * len(missing), type=field.type
            )
        elif field.name in label_columns:
            labels = [key[0] for key in missing]
            columns[field.name] = pa.array(labels, type=pa.string()).cast(field.type)
        elif pa.types.is_string(field.type) or pa.types.is_large_string(field.type):
            columns[field.name] = pa.array(["-"] * len(missing), type=field.type)
        else:
            columns[field.name] = pa.nulls(len(missing), type=field.type)
    return pa.concat_tables([table, pa.table(columns, schema=table.schema)])


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
    return load_arrow_table(cleaned_bytes, layout)
