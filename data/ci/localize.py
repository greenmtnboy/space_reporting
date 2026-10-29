#!/usr/bin/env python3
"""
Copy the raw model into a scratch directory with every published parquet
pointed at a local file, so CI can refresh and validate it without GCS.

`trilogy integration` against the live model compares this branch's ingest
scripts (the raw Python datasources) with parquets the last *merged* refresh
published, so an ingest change fails validation until it has shipped. Run
here instead, `trilogy refresh .` first builds every published datasource
from this branch's own ingest, and validation then checks code and model
together.

    python data/ci/localize.py <target-dir>
"""

import re
import shutil
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent

# file `https://.../launch.parquet`:`gcs://.../launch.parquet`
PUBLISHED = re.compile(r"file `https://storage\.googleapis\.com/[^`]*/([^/`]+\.parquet)`:`gcs://[^`]*`")

ENGINE_CONFIG = """[engine]
dialect = "duck_db"
parallelism = 4

[engine.config]
enable_python_datasources = true
"""


def localize(target: Path) -> None:
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(
        DATA / "raw", target / "raw", ignore=shutil.ignore_patterns("__pycache__")
    )
    shutil.copy(DATA / "refresh.preql", target / "refresh.preql")
    # only the engine half of trilogy.toml: no GCS, no cloud jobs or the
    # failure-handler edge, whose scripts are not copied
    (target / "trilogy.toml").write_text(ENGINE_CONFIG, encoding="utf-8")
    published = (target / "published").resolve()
    published.mkdir()

    rewritten = 0
    for model in sorted((target / "raw").glob("*.preql")):
        text = model.read_text(encoding="utf-8")
        new, count = PUBLISHED.subn(
            lambda m: f"file `{(published / m.group(1)).as_posix()}`", text
        )
        if count:
            model.write_text(new, encoding="utf-8")
            rewritten += count
    if not rewritten:
        raise SystemExit("no published datasources found to localize")
    print(f"localized {rewritten} published datasources into {published}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    localize(Path(sys.argv[1]))
