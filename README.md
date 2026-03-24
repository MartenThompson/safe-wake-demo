# safe-wake-demo


Static demo map for recreational boaters on Minnesota lakes. It shows precomputed "safe wake" regions on selected lakes: water that is at least **100 feet** from the shoreline **and** at least **20 feet** deep, derived from Minnesota DNR lake bathymetry vectors. 

This is an illustration only, not legal or navigational advice.

## Site (GitHub Pages)

The UI lives under [`web_app/`](web_app/). Browsers often block `fetch()` to local GeoJSON when opening `index.html` as a `file://` URL; run a tiny static server from `web_app` for local testing, for example:

```bash
cd web_app && ../.venv/bin/python -m http.server 8080
```

Then open `http://127.0.0.1:8080/`. Publish the `web_app` folder (or project root, depending on your Pages settings) so assets load over **HTTPS**; geolocation typically requires a secure context.

## Regenerating map data

Requires **Python 3.12**:

```bash
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/build_safe_wake.py
```

That reads [`data/mn_lake_bathymetry/`](data/mn_lake_bathymetry/) shapefiles and [`scripts/lake_manifest.json`](scripts/lake_manifest.json), then writes:

- [`web_app/data/safe_wake.geojson`](web_app/data/safe_wake.geojson)
- [`web_app/data/lake_outlines.geojson`](web_app/data/lake_outlines.geojson)

## Data source and attribution

**Bathymetry:** Minnesota Department of Natural Resources (DNR), *Lake Bathymetric Outlines, Contours, and DEM* (Fish & Wildlife). Dataset page: [Minnesota Geospatial Commons — water-lake-bathymetry](http://gisdata.mn.gov/dataset/water-lake-bathymetry).

**Derivative layers:** The GeoJSON published in `web_app/data/` is derived from DNR **lake outlines** and **depth contours** by intersecting (1) an inward buffer of **100 ft** from the shoreline with (2) the area inside the shallowest contour that still meets **≥ 20 ft** depth (contour depth ≤ −20 in the DNR attribute convention).

**License:** Use and redistribution of the data and these derivatives are subject to the Minnesota DNR **General Geographic Data License Agreement**:

https://www.dnr.state.mn.us/sitetools/data_software_license.html

Attribution text: **Bathymetry © Minnesota Department of Natural Resources.**

## Software license

Application source code in this repository may be under the terms in [`LICENSE`](LICENSE) (GPL). That license applies to **code**, not to DNR geographic data; DNR data terms remain in effect for the bathymetry and derived GeoJSON.

## Lake subset

Ten lakes are listed in [`scripts/lake_manifest.json`](scripts/lake_manifest.json). 

Some lakes have limited contour depth in this dataset (e.g. Calhoun may have no ≥ 20 ft contour); those lakes can show **no** safe polygon even though the lake appears on the map.
