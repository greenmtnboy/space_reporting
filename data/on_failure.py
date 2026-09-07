# /// script
# requires-python = ">=3.11"
# ///
"""Open (or bump) a GitHub issue because the refresh failed.

Run by `on_failure.preql` via a `call` statement, which `[dependencies]` in
trilogy.toml schedules only when `refresh.preql` finished `failed`; on the
platform as the `space-on-failure` job, and under `trilogy run .` locally.
The platform never learns about GitHub: this script is the whole handler, and
it reports what it did by printing a `::trilogy-output` line that the run
detail lists as a link.

One open issue per failure episode: a refresh that keeps failing every morning
adds a comment to the existing `auto-fix` issue rather than opening a new one,
so the auto-fix workflow (`.github/workflows/auto-fix.yml`, triggered by the
label) runs once per episode, not once per tick.

Environment:
  SPACE_REPORTING_GITHUB_TOKEN  Fine-grained token with Issues: read/write on
                                the repository (an org secret on the platform,
                                exported to the job via `secret_env`).
                                `GITHUB_TOKEN` is accepted as a fallback.
  TRILOGY_RUN_ID                The platform's run id (absent locally).
  ON_FAILURE_DRY_RUN            Set to anything to print the issue instead of
                                opening it. Needs no token.

Stdlib only on purpose: it is executed with `uv run --no-project`, and a
script that resolves dependencies from PyPI to report a failure has one more
way to fail than it needs.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

REPO = "greenmtnboy/space_reporting"
LABEL = "auto-fix"
LABEL_COLOR = "b60205"
LABEL_DESCRIPTION = "Opened by the pipeline's failure handler; the auto-fix workflow picks it up"
#: The script whose failure this handler answers, as trilogy.toml names it.
FAILED_SCRIPT = "refresh.preql"
JOB_NAME = "space-refresh"
#: Where the failed run can be read. The run id is the only thing the handler
#: has to link with; the failure detail (stderr, per-file outcomes) lives here.
RUN_URL = "https://trilogydata.dev/cloud/runs?run={run_id}"
API = "https://api.github.com"
TIMEOUT_SECONDS = 30


def issue_title(script: str, job: str) -> str:
    return f"[{LABEL}] {job} failed: {script} did not complete"


def issue_body(script: str, job: str, run_id: str | None, when: datetime) -> str:
    stamp = when.strftime("%Y-%m-%d %H:%M UTC")
    run_line = (
        f"- Run: [{run_id}]({RUN_URL.format(run_id=run_id)}); the per-file "
        "outcomes and stderr are on the run detail"
        if run_id
        else "- Run: local (`trilogy run .`)"
    )
    return f"""The scheduled `{job}` job (`data/{script}`) failed at {stamp}, and this issue was opened automatically by `data/on_failure.py`.

{run_line}
- Pipeline: `data/refresh.preql` imports the whole `data/raw/` tree, so a failure is one of the GCAT ingests refusing to publish (most often the upstream TSV changed shape and the `Layout` in `data/raw/ingest_*.py` no longer matches) or a downstream parquet write.

## Reproducing without credentials

Each `data/raw/ingest_*.py` is a standalone `uv run` script that downloads one GCAT table and validates its layout before emitting it. Running the one the failure names reproduces a layout problem on any machine:

```bash
uv run data/raw/ingest_stages.py > /dev/null
```

The full refresh (`trilogy refresh data/refresh.preql`) also needs `GOOGLE_HMAC_KEY`/`GOOGLE_HMAC_SECRET` to write the parquet outputs to GCS; a fix should be verified with the ingest scripts first.

## What a fix looks like

- Update the `Layout` (headers, numeric columns) in the failing ingest to the new upstream shape, per the column reference linked at the top of that script.
- Keep the downstream `.preql` datasource in `data/raw/` in step with any renamed or added columns.
- Open a PR referencing this issue; the next 06:00 UTC tick verifies it once merged (`trilogy cloud sync` deploys `data/` from `main`).
"""


class GitHub:
    def __init__(self, token: str) -> None:
        self.token = token

    def request(self, method: str, path: str, body: dict | None = None) -> tuple[int, object]:
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(f"{API}{path}", data=data, method=method)
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("Authorization", f"Bearer {self.token}")
        req.add_header("User-Agent", "space_reporting-on-failure")
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
                raw = resp.read()
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            if exc.code == 404:
                return 404, None
            raise RuntimeError(f"GitHub {method} {path} -> {exc.code}: {detail}") from exc

    def find_open_issue(self, title: str) -> dict | None:
        query = urllib.parse.urlencode(
            {"state": "open", "labels": LABEL, "per_page": 100}
        )
        status, issues = self.request("GET", f"/repos/{REPO}/issues?{query}")
        if status == 404 or not isinstance(issues, list):
            return None
        for issue in issues:
            # The search endpoint also returns PRs; issues carry no pull_request key.
            if "pull_request" not in issue and issue.get("title") == title:
                return issue
        return None

    def ensure_label(self) -> None:
        status, _ = self.request("GET", f"/repos/{REPO}/labels/{LABEL}")
        if status == 404:
            self.request(
                "POST",
                f"/repos/{REPO}/labels",
                {"name": LABEL, "color": LABEL_COLOR, "description": LABEL_DESCRIPTION},
            )

    def create_issue(self, title: str, body: str) -> dict:
        _, issue = self.request(
            "POST",
            f"/repos/{REPO}/issues",
            {"title": title, "body": body, "labels": [LABEL]},
        )
        assert isinstance(issue, dict)
        return issue

    def comment(self, issue_number: int, body: str) -> None:
        self.request("POST", f"/repos/{REPO}/issues/{issue_number}/comments", {"body": body})


def emit_output(name: str, url: str) -> None:
    """The line pytrilogy turns into a run output (kind=link)."""
    print(f"::trilogy-output name={name} kind=link value={url}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--script", default=FAILED_SCRIPT, help="the script that failed")
    parser.add_argument("--job", default=JOB_NAME, help="the platform job that ran it")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=bool(os.environ.get("ON_FAILURE_DRY_RUN")),
        help="print the issue instead of opening it (also ON_FAILURE_DRY_RUN=1)",
    )
    args = parser.parse_args()

    run_id = os.environ.get("TRILOGY_RUN_ID") or None
    now = datetime.now(timezone.utc)
    title = issue_title(args.script, args.job)
    body = issue_body(args.script, args.job, run_id, now)

    if args.dry_run:
        print(f"[dry run] would open or bump an issue on {REPO} labelled {LABEL!r}:")
        print(f"  title: {title}")
        print(body)
        return 0

    token = os.environ.get("SPACE_REPORTING_GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        print(
            "SPACE_REPORTING_GITHUB_TOKEN is not set, so the failure cannot be "
            "reported to GitHub. The issue that would have been opened:",
            file=sys.stderr,
        )
        print(f"  title: {title}\n{body}", file=sys.stderr)
        return 2

    gh = GitHub(token)
    existing = gh.find_open_issue(title)
    if existing is not None:
        number = existing["number"]
        run_ref = f"[{run_id}]({RUN_URL.format(run_id=run_id)})" if run_id else "a local run"
        gh.comment(
            number,
            f"`{args.job}` failed again at {now.strftime('%Y-%m-%d %H:%M UTC')} "
            f"({run_ref}). Still open, so no new issue was filed.",
        )
        print(f"bumped existing issue #{number}: {existing['html_url']}")
        emit_output("issue", existing["html_url"])
        return 0

    gh.ensure_label()
    issue = gh.create_issue(title, body)
    print(f"opened issue #{issue['number']}: {issue['html_url']}")
    emit_output("issue", issue["html_url"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
