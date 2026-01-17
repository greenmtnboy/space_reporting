# Space Dashboards

Because space - rockets and satellites - are fun and have interesting data.

Contains:
- Launch View
- Satellite View
- Engine View
- Chat w/ data view

Hosted on Github pages.

[View Here](https://greenmtnboy.github.io/space_reporting/)

## Data

Sourced from the amazing:

McDowell, Jonathan C., 2020. General Catalog of Artificial Space Objects, Release 1.8.0 , https://planet4589.org/space/gcat

## Update Datasources

Core parquet files are updated through a set of [Trilogy](https://trilogydata.dev/) + DuckDB scripts, scheduled daily at 6AM. You'll need permission to write
to the trilogy public bucket to run this, or swap out a different storage location you control
for the materialized assets. 

Note that the source data is not updated every day; we'll skip rebuilds if there is no data to fetch.

### Install

Trilogy is a python CLI.

```bash
pip install trilogy[cli]
```

### Refresh Raw Data Files


```bash
trilogy refresh C:\Users\ethan\coding_projects\space_reporting\data\raw
```

> [!TIP]
> The 'refresh' command is used to only update the assets when new data is available.


### Update Output

To update the JSON used in the static websites, run the relevant output script to rebuild
the JSON whenever required.


Example for launch data:
```bash
trilogy run C:\Users\ethan\coding_projects\space_reporting\data\core.preql
```