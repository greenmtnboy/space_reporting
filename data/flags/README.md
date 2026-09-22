# Flag assets

Self-contained SVG assets used by `../raw/organization.preql`.
All four use a 3:2 aspect ratio. The existing mapping is preserved: SU/RU
share the Soviet Union marker, US and CN have their own flags, and other codes
use the United Nations fallback. The Soviet emblem is a simplified original
illustration. The UN flag is vendored from the Wikimedia Commons reference
below, preserving its complete map and olive-branch geometry.

Regenerate the three original national flags with Python's standard library
(this deliberately leaves the vendored UN asset untouched):

```powershell
python data/flags/generate.py
```

Upload from the repository root using an authenticated Google Cloud CLI:

```powershell
gcloud storage cp "data/flags/*.svg" gs://trilogy_public_models/duckdb/launch_report/flags/ --content-type=image/svg+xml --cache-control=public,max-age=3600
```

The bucket supplies public read access. Public URLs start with
`https://storage.googleapis.com/trilogy_public_models/duckdb/launch_report/flags/`.
No runtime Wikimedia requests, fonts, scripts, or external SVG references are required.

## United Nations artwork source

- [Source and attribution](https://commons.wikimedia.org/wiki/File:Flag_of_the_United_Nations.svg)
- [Original SVG](https://upload.wikimedia.org/wikipedia/commons/2/2f/Flag_of_the_United_Nations.svg)
- Revision: 20 July 2022, retrieved 22 September 2026.
- Authors credited by Commons: Denelson83, Zscout370, Madden; see file history
  for subsequent contributors.
- Commons license designation: public domain in the US (PD-US-no notice-UN).
- Upstream SHA-1: `3234219addecf3cf8038bc9cd0c0d07f069d719a`.
- Stored verbatim at 1200 x 800; regeneration does not download or replace it.
