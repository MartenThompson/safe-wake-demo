# safe-wake-demo


This repo serves a webapp for recreational boaters on Minnesota lakes informing them of "safe wake" regions on selected lakes. Within these regions, boaters are free to operate without restriction; outside safe wake regions, boaters should minimize their wake.

The demo webapp is live at https://martenthompson.com/safe-wake-demo/ 

This is an illustration only, not legal or navigational advice.


## Motivation: Environmental & Economic Impact

When wake boats operate in shallow water, they disturb sediment and organic material that would otherwise not enter the water column. This increased mixing negatively affects the lake bottom habitat, erodes the shoreline, worsens turbidity, and can foster algal blooms. Municipalities and counties then expend $100k-1M on water quality remediation.

Further news coverage can be found by the [Lakes Area Review](https://nlslar.com/2026/03/27/wake-boats-under-scrutiny-as-research-reveals-damage-to-minnesota-lakes/) and the [Middle Fork of the Crow River Watershed District](https://www.mfcrow.org/copy-of-permits-guidelines-1), in addition to the [orginal study by the UMN St. Anthony Falls Laboratory (2022)](https://conservancy.umn.edu/items/bd2d2968-21c4-4726-8a61-53e7daafcb56).


## Usage

The webapp displays "safe wake" regions on selected lakes. Within safe wake regions, boaters are free to create large wakes (e.g. for wake surfing). Outside safe wake regions, boaters should reduce speed/trim to minimize their wake and reduce shoreline erosion and habitat loss. 

Users may inspect the safe wake regions around the state before boating by panning around the map. 

While on the water, users may tap the <img width="20" height="20" alt="compass_icon" src="https://github.com/user-attachments/assets/0dc41302-56bf-4777-9191-3f1fe61d2969" /> icon. The webapp will then follow their location and provide clear indication of whether they are in a safe wake zone or not, as shown below.

<img width="339" height="736" alt="safewake" src="https://github.com/user-attachments/assets/26f5400b-271b-4761-b3b3-6f05d5c63e3a" />

<img width="338" height="737" alt="nosafewake" src="https://github.com/user-attachments/assets/195930b2-dd94-4f94-a958-9dbc08907d8e" />

## Technical Details of Demo

Safe wake regions define areas waters that are at least 500 feet from the shoreline and at least 20 feet deep, as derived from Minnesota DNR lake bathymetry vectors.

### Site (GitHub Pages)

The UI lives under [`docs/`](docs/) so GitHub Pages can serve from the `docs` folder. Browsers often block `fetch()` to local GeoJSON when opening `index.html` as a `file://` URL; run a tiny static server from `docs` for local testing, for example:

```bash
.venv/bin/python -m http.server 8080 --directory docs
```

Then open `http://127.0.0.1:8080/`. In GitHub repo settings, set Pages to publish from the `/docs` folder on your default branch (or your chosen source) so assets load over HTTPS; geolocation typically requires a secure context.

### Regenerating map data

Requires Python 3.12:

```bash
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/build_safe_wake.py
```

That reads [`data/mn_lake_bathymetry/`](data/mn_lake_bathymetry/) shapefiles and [`scripts/lake_manifest.json`](scripts/lake_manifest.json), then writes:

- [`docs/data/safe_wake.geojson`](docs/data/safe_wake.geojson)
- [`docs/data/lake_outlines.geojson`](docs/data/lake_outlines.geojson)

### Data source and attribution

Bathymetry: Minnesota Department of Natural Resources (DNR), *Lake Bathymetric Outlines, Contours, and DEM* (Fish & Wildlife). Dataset page: [Minnesota Geospatial Commons — water-lake-bathymetry](http://gisdata.mn.gov/dataset/water-lake-bathymetry).

Derivative layers: The GeoJSON published in `docs/data/` is derived from DNR lake outlines and depth contours by intersecting (1) an inward buffer of 500 ft from the shoreline with (2) the area inside the shallowest contour that still meets ≥ 20 ft depth (contour depth ≤ −20 in the DNR attribute convention).

License: Use and redistribution of the data and these derivatives are subject to the Minnesota DNR General Geographic Data License Agreement:

https://www.dnr.state.mn.us/sitetools/data_software_license.html

Attribution text: Bathymetry © Minnesota Department of Natural Resources.

### Software license

Application source code in this repository may be under the terms in [`LICENSE`](LICENSE) (GPL). That license applies to code, not to DNR geographic data; DNR data terms remain in effect for the bathymetry and derived GeoJSON.

### Lake subset

Analyzing and serving safe wake polygons for all 10,000+ lakes in MN is beyond the scope of this demo. It presents results for a subset of 27 lakes, listed in [`scripts/lake_manifest.json`](scripts/lake_manifest.json). 
