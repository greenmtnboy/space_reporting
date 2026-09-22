# Flag assets

Original, self-contained SVG illustrations used by `../raw/organization.preql`.
All four use a consistent 3:2 canvas. The existing mapping is preserved: SU/RU
share the Soviet Union marker, US and CN have their own flags, and other codes
use the United Nations fallback. The Soviet emblem and UN polar map/olive
branches are simplified illustrations, not official emblem reproductions.

Regenerate the checked-in assets with Python's standard library:

```powershell
python data/flags/generate.py
```

Upload from the repository root using an authenticated Google Cloud CLI:

```powershell
gcloud storage cp "data/flags/*.svg" gs://trilogy_public_models/duckdb/launch_report/flags/ --content-type=image/svg+xml --cache-control=public,max-age=3600
```

The bucket supplies public read access. Public URLs start with
`https://storage.googleapis.com/trilogy_public_models/duckdb/launch_report/flags/`.
No Wikimedia images, fonts, scripts, or external SVG references are required.
