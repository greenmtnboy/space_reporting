# Flag assets

These four SVGs are copied verbatim from Wikimedia Commons and served from our
public GCS bucket. Source pages, authors, copyright designations, retrieval dates,
and SHA-256 checksums are recorded in `sources.json`. There are no runtime requests
to Wikimedia. The files retain their source proportions: US 19:10, USSR 2:1,
China 3:2, UN 3:2. The former illustration generator has been removed.

`../raw/organization.preql` retains the existing mapping: SU/RU share the Soviet
Union marker, US and CN have their own flags, and other codes use the UN fallback.

## Copyright and symbol use

Commons marks the US, Soviet, and Chinese source files as public domain and the
UN file as public domain in the United States. See each source page for the exact
grounds and jurisdictional qualifications. These copyright designations permit
copying the artwork; they are not a blanket clearance for every use of an emblem.

The [UN Flag Code, Article 6](https://www.un.org/dgacm/sites/www.un.org.dgacm/files/Documents_Protocol/flagcodeun20nov2020stsgb20204.pdf)
places separate conditions on use by organizations and individuals, including
no implied affiliation, no commercial advantage, and temporary display. It does
not clearly authorize this project's permanent generic fallback use. That use
has not been cleared by the UN. A neutral globe would avoid representing other
countries as the UN. National symbols can also have restrictions independent of
copyright; see the source notices. No UN affiliation or endorsement is claimed.

## Publishing

Upload from the repository root with an authenticated Google Cloud CLI:

```powershell
gcloud storage cp "data/flags/*.svg" gs://trilogy_public_models/duckdb/launch_report/flags/2026-09-22/ --content-type=image/svg+xml --cache-control=public,max-age=3600
```

The bucket supplies public read access. URLs start with
`https://storage.googleapis.com/trilogy_public_models/duckdb/launch_report/flags/2026-09-22/`.
The dated prefix avoids cached copies of the earlier illustrations. For a future
revision, review the source terms, update the manifest, publish under a new dated
prefix, and update the URLs in `organization.preql` together.
