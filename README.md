# safe-wake-demo


This repo serves a demo webapp for recreational boaters on Minnesota lakes. It shows precomputed "safe wake" regions on selected lakes: water that is at least 500 feet from the shoreline and at least 20 feet deep, derived from Minnesota DNR lake bathymetry vectors. Within these regions, boaters are free to operate without restriction; outside safe wake regions, boaters should reduce speed/trim to minimize their wake and reduce shoreline erosion and habitat loss. 

This is an illustration only, not legal or navigational advice.


## Usage

Users may inspect the safe wake regions around the state before boating. While on the water, the webapp can provide clear indication of whether they are in a safe wake zone or not.

<img width="339" height="736" alt="image" src="https://github.com/user-attachments/assets/26f5400b-271b-4761-b3b3-6f05d5c63e3a" />

<img width="340" height="737" alt="image" src="https://github.com/user-attachments/assets/bce467fb-dac2-471b-a67c-8bd3bf595b45" />



## Site (GitHub Pages)

The UI lives under [`docs/`](docs/) so GitHub Pages can serve from the `docs` folder. Browsers often block `fetch()` to local GeoJSON when opening `index.html` as a `file://` URL; run a tiny static server from `docs` for local testing, for example:

```bash
.venv/bin/python -m http.server 8080 --directory docs
```

Then open `http://127.0.0.1:8080/`. In GitHub repo settings, set Pages to publish from the `/docs` folder on your default branch (or your chosen source) so assets load over HTTPS; geolocation typically requires a secure context.

## Regenerating map data

Requires Python 3.12:

```bash
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/build_safe_wake.py
```

That reads [`data/mn_lake_bathymetry/`](data/mn_lake_bathymetry/) shapefiles and [`scripts/lake_manifest.json`](scripts/lake_manifest.json), then writes:

- [`docs/data/safe_wake.geojson`](docs/data/safe_wake.geojson)
- [`docs/data/lake_outlines.geojson`](docs/data/lake_outlines.geojson)

## Data source and attribution

Bathymetry: Minnesota Department of Natural Resources (DNR), *Lake Bathymetric Outlines, Contours, and DEM* (Fish & Wildlife). Dataset page: [Minnesota Geospatial Commons — water-lake-bathymetry](http://gisdata.mn.gov/dataset/water-lake-bathymetry).

Derivative layers: The GeoJSON published in `docs/data/` is derived from DNR lake outlines and depth contours by intersecting (1) an inward buffer of 500 ft from the shoreline with (2) the area inside the shallowest contour that still meets ≥ 20 ft depth (contour depth ≤ −20 in the DNR attribute convention).

License: Use and redistribution of the data and these derivatives are subject to the Minnesota DNR General Geographic Data License Agreement:

https://www.dnr.state.mn.us/sitetools/data_software_license.html

Attribution text: Bathymetry © Minnesota Department of Natural Resources.

## Software license

Application source code in this repository may be under the terms in [`LICENSE`](LICENSE) (GPL). That license applies to code, not to DNR geographic data; DNR data terms remain in effect for the bathymetry and derived GeoJSON.

## Lake subset

Ten lakes are listed in [`scripts/lake_manifest.json`](scripts/lake_manifest.json). 

Some lakes have limited contour depth in this dataset (e.g. Calhoun may have no ≥ 20 ft contour); those lakes can show no safe polygon even though the lake appears on the map.
