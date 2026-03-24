#!/usr/bin/env python3
"""Build precomputed safe-wake GeoJSON for static web_app from DNR shapefiles."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union

# NAD83 / UTM zone 15N (meters) — matches DNR lake bathymetry .prj
WORK_CRS = "EPSG:26915"
OUT_CRS = "EPSG:4326"
FT_TO_M = 0.3048
MIN_DEPTH_FT = 20.0
SHORE_DISTANCE_FT = 100.0


def norm_dow(value: object) -> str:
    return str(int(float(str(value).strip()))).zfill(8)


def deep_polygon_from_contours(
    lake_contours: gpd.GeoDataFrame,
    min_depth_ft: float,
) -> Polygon | MultiPolygon:
    """Area where depth >= min_depth_ft, from closed contour lines (DEPTH <= -min_depth_ft)."""
    if lake_contours.empty:
        return MultiPolygon([])
    depth_col = lake_contours["DEPTH"].astype("int32")
    mask = depth_col <= -int(min_depth_ft)
    subset = lake_contours.loc[mask].copy()
    if subset.empty:
        return MultiPolygon([])
    boundary_depth = int(subset["DEPTH"].astype("int32").max())
    boundary_lines = subset[subset["DEPTH"].astype("int32") == boundary_depth]
    polys: list[Polygon] = []
    for geom in boundary_lines.geometry:
        geoms = [geom] if geom.geom_type == "LineString" else getattr(geom, "geoms", [])
        for g in geoms:
            if g.geom_type != "LineString" or not g.is_closed:
                continue
            coords = list(g.coords)
            if len(coords) < 4:
                continue
            poly = Polygon(coords)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly.geom_type == "Polygon" and not poly.is_empty:
                polys.append(poly)
    if not polys:
        return MultiPolygon([])
    u = unary_union(polys)
    if u.geom_type == "Polygon":
        return u
    if u.geom_type == "MultiPolygon":
        return u
    return MultiPolygon([])


def lake_outline_union(outline: gpd.GeoDataFrame, dow: str) -> Polygon | MultiPolygon:
    sub = outline[outline["_dow"] == dow]
    if sub.empty:
        return MultiPolygon([])
    u = unary_union(sub.geometry)
    if u.geom_type == "Polygon":
        return u
    if u.geom_type == "MultiPolygon":
        return u
    if u.geom_type == "GeometryCollection":
        polys = [g for g in u.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        if not polys:
            return MultiPolygon([])
        u2 = unary_union(polys)
        return u2 if u2.geom_type in ("Polygon", "MultiPolygon") else MultiPolygon([])
    return MultiPolygon([])


def compute_safe(
    outline_geom: Polygon | MultiPolygon,
    contours_gdf: gpd.GeoDataFrame,
    shore_ft: float,
    min_depth_ft: float,
) -> Polygon | MultiPolygon:
    if outline_geom.is_empty:
        return MultiPolygon([])
    deep = deep_polygon_from_contours(contours_gdf, min_depth_ft)
    if deep.is_empty:
        return MultiPolygon([])
    deep = deep.intersection(outline_geom)
    if deep.is_empty:
        return MultiPolygon([])
    buf_m = -(shore_ft * FT_TO_M)
    inner = outline_geom.buffer(buf_m)
    if inner.is_empty:
        return MultiPolygon([])
    safe = inner.intersection(deep)
    if safe.is_empty:
        return MultiPolygon([])
    if not safe.is_valid:
        safe = safe.buffer(0)
    return safe if isinstance(safe, (Polygon, MultiPolygon)) else MultiPolygon([])


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    manifest_path = root / "scripts" / "lake_manifest.json"
    outline_path = root / "data" / "mn_lake_bathymetry" / "lake_bathymetric_outline.shp"
    contours_path = (
        root / "data" / "mn_lake_bathymetry" / "lake_bathymetric_contours.shp"
    )
    out_dir = root / "web_app" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)

    with manifest_path.open(encoding="utf-8") as f:
        manifest = json.load(f)

    outline = gpd.read_file(outline_path)
    outline["_dow"] = outline["DOWLKNUM"].map(norm_dow)
    contours = gpd.read_file(contours_path)
    contours["_dow"] = contours["DOWLKNUM"].map(norm_dow)

    outline = outline.to_crs(WORK_CRS)
    contours = contours.to_crs(WORK_CRS)

    safe_rows: list[dict] = []
    outline_rows: list[dict] = []

    for entry in manifest:
        dow = norm_dow(entry["dowlknum"])
        name = entry.get("common_name") or entry.get("lake_name", dow)
        ol = lake_outline_union(outline, dow)
        cnt = contours[contours["_dow"] == dow]
        safe_geom = compute_safe(ol, cnt, SHORE_DISTANCE_FT, MIN_DEPTH_FT)

        safe_rows.append(
            {
                "dowlknum": dow,
                "name": name,
                "lake_name": entry.get("lake_name", ""),
                "county": entry.get("county", ""),
                "geometry": safe_geom,
            }
        )
        outline_rows.append(
            {
                "dowlknum": dow,
                "name": name,
                "geometry": ol,
            }
        )

    safe_gdf = gpd.GeoDataFrame(safe_rows, crs=WORK_CRS).to_crs(OUT_CRS)
    out_safe = out_dir / "safe_wake.geojson"
    safe_gdf.to_file(out_safe, driver="GeoJSON")

    ol_gdf = gpd.GeoDataFrame(outline_rows, crs=WORK_CRS).to_crs(OUT_CRS)
    ol_gdf.to_file(out_dir / "lake_outlines.geojson", driver="GeoJSON")

    print(f"Wrote {out_safe} ({len(safe_gdf)} features)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
