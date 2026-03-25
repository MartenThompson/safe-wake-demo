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
  const mapShell = document.getElementById("map-shell");
  const locationBanner = document.getElementById("map-location-banner");
  let lastKnownLatLng = null;

  const introModal = document.getElementById("intro-modal");
  const introDismiss = document.getElementById("intro-modal-dismiss");
  if (introModal && introDismiss) {
    if (sessionStorage.getItem("introModalSeen") === "1") {
      introModal.hidden = true;
    }
    introDismiss.addEventListener("click", function () {
      introModal.hidden = true;
      sessionStorage.setItem("introModalSeen", "1");
    });
  }

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
        setLocationShellState("idle");
        setStatus(
          err.message ||
            "Location permission denied or unavailable. Allow location for this site (HTTPS may be required).",
        );
      },
      onLocationOutsideMapBounds: function (ctrl) {
        ctrl.stop();
        setStatus(
          "Your location appears outside the mapped area for this demo.",
        );
        if (lastKnownLatLng) {
          updateLocationForLatLng(lastKnownLatLng);
        } else {
          setLocationShellState("unknown");
        }
      },
    })
    .addTo(map);

  map.on("locateactivate", function () {
    setLocationShellState("locating");
  });

  map.on("locatedeactivate", function () {
    setLocationShellState("idle");
  });

  function collapseAllWarningMarkers() {
    let changed = false;
    warningMarkers.forEach(function (entry) {
      if (entry.expanded) {
        entry.expanded = false;
        changed = true;
      }
    });
    if (changed) {
      refreshWarningMarkers();
    }
  }

  map.on("click", function () {
    collapseAllWarningMarkers();
  });
  map.on("zoomstart", function () {
    collapseAllWarningMarkers();
  });
  map.on("movestart", function () {
    collapseAllWarningMarkers();
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

  function pointInAnyLakeOutline(lng, lat, outlineFc) {
    if (!outlineFc || !outlineFc.features || typeof turf === "undefined") {
      return false;
    }
    const pt = turf.point([lng, lat]);
    for (let i = 0; i < outlineFc.features.length; i++) {
      const f = outlineFc.features[i];
      if (isEmptyGeom(f.geometry)) continue;
      try {
        if (turf.booleanPointInPolygon(pt, f)) {
          return true;
        }
      } catch {
        /* ignore invalid geometry */
      }
    }
    return false;
  }

  /**
   * safe: inside a precomputed green safe-wake polygon.
   * notSafe: inside a lake outline but not in a safe zone (shore band, holes, or no zone).
   * unknown: outside all analyzed lake outlines (or data not ready).
   */
  function classifyLocation(latlng) {
    const safeFc = window._safeWakeFc;
    const outlineFc = window._lakeOutlinesFc;
    if (!safeFc || !outlineFc || typeof turf === "undefined") {
      return "unknown";
    }
    const names = pointInSafeWake(latlng.lng, latlng.lat, safeFc);
    if (names && names.length > 0) {
      return "safe";
    }
    if (pointInAnyLakeOutline(latlng.lng, latlng.lat, outlineFc)) {
      return "notSafe";
    }
    return "unknown";
  }

  function setLocationShellState(state) {
    if (!mapShell || !locationBanner) return;
    mapShell.classList.remove(
      "map-shell--idle",
      "map-shell--locating",
      "map-shell--safe",
      "map-shell--not-safe",
      "map-shell--unknown",
    );
    const labels = {
      idle: "",
      locating: "Locating…",
      safe: "In safe wake zone",
      notSafe: "Not in safe wake zone",
      unknown: "Unknown",
    };
    if (state === "idle") {
      mapShell.classList.add("map-shell--idle");
      locationBanner.hidden = true;
      locationBanner.textContent = "";
      return;
    }
    const shellClass = {
      safe: "map-shell--safe",
      notSafe: "map-shell--not-safe",
      unknown: "map-shell--unknown",
      locating: "map-shell--locating",
    };
    mapShell.classList.add(shellClass[state] || "map-shell--unknown");
    locationBanner.hidden = false;
    locationBanner.textContent = labels[state] || labels.unknown;
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
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

  const WARNING_COMPACT_PX = 40;
  const WARNING_SVG_COMPACT = 22;

  /**
   * Fixed-size compact icon; expanded is one line (CSS). Collapse on map click / zoom / pan.
   */
  function buildWarningDivIcon(outlineFeature, lakeName, expanded) {
    const labelLake = lakeName || "this lake";
    const compactAria =
      "No safe wake zones in " + labelLake.replace(/"/g, "'") + ".";

    if (!expanded) {
      const iconW = WARNING_COMPACT_PX;
      const iconH = WARNING_COMPACT_PX;
      const html =
        '<div class="no-safe-zone-badge no-safe-zone-badge--compact" role="img" aria-label="' +
        escapeHtmlAttr(compactAria) +
        '">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' +
        WARNING_SVG_COMPACT +
        '" height="' +
        WARNING_SVG_COMPACT +
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

    const size = map.getSize();
    const maxW = Math.min(360, Math.max(200, size.x ? size.x - 48 : 320));
    const iconH = 34;
    const svgS = 18;
    const html =
      '<div class="no-safe-zone-badge no-safe-zone-badge--expanded" style="width:' +
      maxW +
      'px;height:' +
      iconH +
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
        iconSize: [maxW, iconH],
        iconAnchor: [Math.floor(maxW / 2), Math.floor(iconH / 2)],
      }),
      latlng: pickWarningLatLng(outlineFeature),
    };
  }

  function refreshWarningMarkers() {
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
        const willExpand = !entry.expanded;
        warningMarkers.forEach(function (w) {
          w.expanded = w === entry && willExpand;
        });
        refreshWarningMarkers();
      });
      warningMarkers.push(entry);
    });
  }

  function updateLocationForLatLng(latlng) {
    lastKnownLatLng = latlng;
    const cat = classifyLocation(latlng);
    if (cat === "safe") {
      setLocationShellState("safe");
    } else if (cat === "notSafe") {
      setLocationShellState("notSafe");
    } else {
      setLocationShellState("unknown");
    }
  }

  map.on("locationfound locationupdate", function (e) {
    updateLocationForLatLng(e.latlng);
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
      window._lakeOutlinesFc = outlines;
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
