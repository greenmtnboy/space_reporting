# Space Dashboards

Hosted on Github pages.

[View Here](https://greenmtnboy.github.io/space_reporting/)

## Update datasources


Core parquet files are updated through a Trilogy script. You'll need permission to write
to the trilogy public bucket to run this, or swap out a different storage location you control
for the materialized assets. 

### Install

```bash
pip install trilogy[cli]
```

### Refresh Raw Data Files

```bash
trilogy refresh C:\Users\ethan\coding_projects\space_reporting\data\raw
```

:::tip
The 'refresh' command is used to only update the assets when new data is available.
:::

### Update Output

To update the JSON used in the static websites, run the relevant output script to rebuild
the JSON whenever required.

```bash
trilogy exec C:\Users\ethan\coding_projects\space_reporting\data\core.preq
```