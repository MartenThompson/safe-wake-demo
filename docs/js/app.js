(function () {
  "use strict";

  /* Default map center: 45°15'10.6"N 94°54'07.6"W (west-central MN) */
  const DEFAULT_CENTER = [
    45 + 15 / 60 + 10.6 / 3600,
    -(94 + 54 / 60 + 7.6 / 3600),
  ];

  const map = L.map("map", { zoomControl: true });
  map.zoomControl.setPosition("topleft");

  /* CARTO label tiles above polygons (overlayPane=400) but below markers (600): package typography. */
  map.createPane("cartoLabels");
  map.getPane("cartoLabels").style.zIndex = "550";
  map.getPane("cartoLabels").style.pointerEvents = "none";

  /* Must exist before any setView (zoomend can fire synchronously and touch warningMarkers). */
  const warningMarkers = [];
  /* Added to map after lake layers so markers paint above polygons (see Promise.then). */
  const warningLayer = L.featureGroup();

  /* CARTO Positron without labels: minimal roads; no highway/place text */
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    },
  ).addTo(map);

  /* OSM-derived names (lakes, towns, etc.) in CARTO Positron typography; attribution on base layer. */
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
    {
      attribution: "",
      subdomains: "abcd",
      maxZoom: 20,
      pane: "cartoLabels",
    },
  ).addTo(map);

  map.setView(DEFAULT_CENTER, 11);

  const outlineLayer = L.geoJSON(null, {
    style: {
      color: "#8ab4e8",
      weight: 1.5,
      fillColor: "#4a7ab8",
      fillOpacity: 0.12,
    },
  }).addTo(map);

  const safeLayer = L.geoJSON(null, {
    style: {
      color: "#3d9a5c",
      weight: 1,
      fillColor: "#3d9a5c",
      fillOpacity: 0.4,
    },
    onEachFeature: function (feature, layer) {
      layer.bindPopup("Boat wakes up to 6 feet tall allowed.");
    },
  }).addTo(map);

  warningLayer.addTo(map);

  const statusEl = document.getElementById("status");

  L.control
    .locate({
      position: "topleft",
      flyTo: true,
      showCompass: true,
      showPopup: false,
      drawCircle: true,
      drawMarker: true,
      markerStyle: {
        radius: 9,
        color: "#fff",
        weight: 2,
        fillColor: "#2563eb",
        fillOpacity: 1,
      },
      circleStyle: {
        color: "#2563eb",
        weight: 1,
        opacity: 0.35,
        fillOpacity: 0.08,
      },
      locateOptions: {
        enableHighAccuracy: true,
        maxZoom: 14,
        timeout: 15000,
        maximumAge: 0,
      },
      strings: {
        title: "Show my location",
      },
      onLocationError: function (err) {
        setStatus(
          err.message ||
            "Location permission denied or unavailable. Allow location for this site (HTTPS may be required).",
        );
      },
      onLocationOutsideMapBounds: function (ctrl) {
        ctrl.stop();
        setStatus(
          "Your location appears outside the mapped lakes for this demo.",
        );
      },
    })
    .addTo(map);

  map.on("locateactivate", function () {
    setStatus("Requesting location…");
  });

  map.on("zoomend", function () {
    refreshWarningBadgeSizes();
  });
  map.on("moveend", function () {
    refreshWarningBadgeSizes();
  });
  map.on("resize", function () {
    refreshWarningBadgeSizes();
  });

  function isEmptyGeom(g) {
    if (!g || !g.type) return true;
    if (g.type === "MultiPolygon") {
      return !g.coordinates || g.coordinates.length === 0;
    }
    if (g.type === "Polygon") {
      return !g.coordinates || g.coordinates.length === 0;
    }
    return false;
  }

  function pointInSafeWake(lng, lat, fc) {
    if (!fc || !fc.features || typeof turf === "undefined") return null;
    const pt = turf.point([lng, lat]);
    const names = [];
    for (let i = 0; i < fc.features.length; i++) {
      const f = fc.features[i];
      if (isEmptyGeom(f.geometry)) continue;
      try {
        if (turf.booleanPointInPolygon(pt, f)) {
          names.push(f.properties.name || f.properties.lake_name || "Lake");
        }
      } catch {
        /* ignore invalid geometry */
      }
    }
    return names;
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  /** Pixel width/height of the lake outline's axis-aligned bounding box at the current zoom. */
  function computeLakeBBoxScreenPx(outlineFeature) {
    if (typeof turf === "undefined") return { w: 120, h: 80 };
    const size = map.getSize();
    if (!size.x || !size.y) {
      return { w: 120, h: 80 };
    }
    const bbox = turf.bbox(outlineFeature);
    const sw = map.latLngToLayerPoint(L.latLng(bbox[1], bbox[0]));
    const se = map.latLngToLayerPoint(L.latLng(bbox[1], bbox[2]));
    const nw = map.latLngToLayerPoint(L.latLng(bbox[3], bbox[0]));
    const w = Math.max(8, Math.abs(se.x - sw.x));
    const h = Math.max(8, Math.abs(sw.y - nw.y));
    if (!Number.isFinite(w) || !Number.isFinite(h)) {
      return { w: 120, h: 80 };
    }
    return { w: w, h: h };
  }

  /**
   * Prefer bbox center if inside the polygon; otherwise a point known to lie in the lake.
   */
  function pickWarningLatLng(outlineFeature) {
    const bbox = turf.bbox(outlineFeature);
    const cx = (bbox[0] + bbox[2]) / 2;
    const cy = (bbox[1] + bbox[3]) / 2;
    const centerPt = turf.point([cx, cy]);
    try {
      if (turf.booleanPointInPolygon(centerPt, outlineFeature)) {
        return L.latLng(cy, cx);
      }
    } catch {
      /* fall through */
    }
    try {
      const p = turf.pointOnFeature(outlineFeature);
      return L.latLng(
        p.geometry.coordinates[1],
        p.geometry.coordinates[0],
      );
    } catch {
      return L.latLng(cy, cx);
    }
  }

  const WARNING_SVG_PATH =
    '<path fill="#a16207" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>';

  function escapeHtmlText(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeHtmlAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  /**
   * Badge sized to the lake screen bbox. Icon-only until expanded by click.
   */
  function buildWarningDivIcon(outlineFeature, lakeName, expanded) {
    const screen = computeLakeBBoxScreenPx(outlineFeature);
    const margin = 0.86;
    const maxW = screen.w * margin;
    const maxH = screen.h * margin;

    const labelLake = lakeName || "this lake";
    const compactAria =
      "No safe wake zones in " + labelLake.replace(/"/g, "'") + ".";

    if (!expanded) {
      const minSide = Math.min(maxW, maxH);
      const iconW = Math.max(
        26,
        Math.min(52, Math.floor(minSide * 0.42)),
      );
      const iconH = iconW;
      const svgS = Math.max(14, Math.floor(iconW * 0.48));
      const html =
        '<div class="no-safe-zone-badge no-safe-zone-badge--compact" role="img" aria-label="' +
        escapeHtmlAttr(compactAria) +
        '" style="width:' +
        iconW +
        "px;height:" +
        iconH +
        'px;">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' +
        svgS +
        '" height="' +
        svgS +
        '">' +
        WARNING_SVG_PATH +
        "</svg></div>";
      return {
        icon: L.divIcon({
          className: "no-safe-zone-marker",
          html: html,
          iconSize: [iconW, iconH],
          iconAnchor: [Math.floor(iconW / 2), Math.floor(iconH / 2)],
        }),
        latlng: pickWarningLatLng(outlineFeature),
      };
    }

    let fontSize = Math.max(
      8,
      Math.min(12, Math.min(maxW / 16, maxH / 5)),
    );
    let svgS = Math.round(fontSize * 1.1);
    let contentH = 8 + svgS + fontSize * 1.3 * 2;
    while (fontSize > 8 && contentH > maxH * 0.95) {
      fontSize -= 0.5;
      svgS = Math.round(fontSize * 1.1);
      contentH = 8 + svgS + fontSize * 1.3 * 2;
    }
    const iconW = Math.min(Math.floor(maxW), 360);
    const iconH = Math.min(Math.floor(maxH), Math.ceil(contentH));
    const html =
      '<div class="no-safe-zone-badge" style="width:' +
      iconW +
      "px;height:" +
      iconH +
      "px;font-size:" +
      fontSize +
      'px;">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' +
      svgS +
      '" height="' +
      svgS +
      '" aria-hidden="true">' +
      WARNING_SVG_PATH +
      "</svg>" +
      "<span>No safe wake zones in " +
      escapeHtmlText(labelLake) +
      ".</span>" +
      "</div>";
    return {
      icon: L.divIcon({
        className: "no-safe-zone-marker",
        html: html,
        iconSize: [iconW, iconH],
        iconAnchor: [Math.floor(iconW / 2), Math.floor(iconH / 2)],
      }),
      latlng: pickWarningLatLng(outlineFeature),
    };
  }

  function refreshWarningBadgeSizes() {
    if (!warningMarkers.length) return;
    warningMarkers.forEach(function (entry) {
      const built = buildWarningDivIcon(
        entry.outlineFeature,
        entry.lakeName,
        entry.expanded,
      );
      entry.marker.setIcon(built.icon);
      entry.marker.setLatLng(built.latlng);
    });
  }

  function addNoSafeZoneWarnings(safeFc, outlineFc) {
    if (typeof turf === "undefined") return;
    warningMarkers.length = 0;
    const byDow = {};
    outlineFc.features.forEach(function (f) {
      const d = String(f.properties.dowlknum || "");
      byDow[d] = f;
    });
    safeFc.features.forEach(function (f) {
      if (!isEmptyGeom(f.geometry)) return;
      const dow = String(f.properties.dowlknum || "");
      const ol = byDow[dow];
      if (!ol) return;
      const name = f.properties.name || f.properties.lake_name || "Lake";
      const entry = {
        marker: null,
        outlineFeature: ol,
        lakeName: name,
        expanded: false,
      };
      const built = buildWarningDivIcon(ol, name, false);
      const marker = L.marker(built.latlng, {
        icon: built.icon,
        zIndexOffset: 2500,
      }).addTo(warningLayer);
      entry.marker = marker;
      marker.on("click", function (e) {
        L.DomEvent.stopPropagation(e);
        entry.expanded = !entry.expanded;
        refreshWarningBadgeSizes();
      });
      warningMarkers.push(entry);
    });
  }

  function updateStatusForLatLng(latlng) {
    const names = pointInSafeWake(latlng.lng, latlng.lat, window._safeWakeFc);
    if (names && names.length > 0) {
      setStatus(
        "Your location is inside a safe wake zone.",
      );
    } else {
      setStatus(
        "Your location is not inside a safe wake zone for this demo (or zones are unavailable for that lake).",
      );
    }
  }

  map.on("locationfound", function (e) {
    updateStatusForLatLng(e.latlng);
  });

  function loadGeoJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("Failed to load " + url);
      return r.json();
    });
  }

  Promise.all([
    loadGeoJson("data/lake_outlines.geojson"),
    loadGeoJson("data/safe_wake.geojson"),
  ])
    .then(function (results) {
      const outlines = results[0];
      const safe = results[1];
      window._safeWakeFc = safe;
      outlineLayer.addData(outlines);
      safeLayer.addData(safe);
      const combined = L.featureGroup([outlineLayer, safeLayer]);
      const bounds = combined.getBounds().pad(0.08);
      const fitZoom = map.getBoundsZoom(bounds);
      const targetZoom = Math.min(fitZoom + 5, map.getMaxZoom());
      map.invalidateSize();
      map.setView(DEFAULT_CENTER, targetZoom);
      addNoSafeZoneWarnings(safe, outlines);
      /* setView may not fire zoomend if zoom unchanged; always refresh after layout. */
      function refreshWhenStable() {
        map.invalidateSize();
        refreshWarningBadgeSizes();
      }
      refreshWhenStable();
      requestAnimationFrame(function () {
        requestAnimationFrame(refreshWhenStable);
      });
      map.whenReady(function () {
        refreshWhenStable();
        warningLayer.bringToFront();
      });
    })
    .catch(function (err) {
      setStatus("Could not load lake data: " + err.message);
      console.error(err);
    });
})();
