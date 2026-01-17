# Project Context

Animated visual of rocket launches through 2025. plays a year over a minute, showing an expanding circle whenever a rocket launches.

Size of circle is proportional to the rockets payload class. Color of circle is proportional to the type of the rocket.

## Data
Data is sourced from GCAT and stored on GCS. Extracts populated/generated though the trilogy scripts under data, but the 'raw_data.json' extract produced is what the static site will use.


McDowell, Jonathan C., 2020. General Catalog of Artificial Space Objects,
  Release 1.8.0 , https://planet4589.org/space/gcat

## Tech

Vite, vue, typescript

Use pnpm not NPM for all management. 

This is critical - NO NPM.

## Project Tracking

When working on a vue view in the app, record all design choices in the relevant _SPEC markdown file under views. 