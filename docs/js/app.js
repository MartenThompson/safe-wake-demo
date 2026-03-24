(function () {
  "use strict";

  const MN_BOUNDS = [
    [43.4, -97.3],
    [49.5, -89.4],
  ];

  const map = L.map("map", { zoomControl: true });

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  map.fitBounds(MN_BOUNDS);

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
      const n = feature.properties && feature.properties.name;
      if (n) layer.bindPopup(n);
    },
  }).addTo(map);

  let userMarker = null;
  const statusEl = document.getElementById("status");

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

  function updateLocation(latlng) {
    if (userMarker) {
      map.removeLayer(userMarker);
    }
    userMarker = L.circleMarker(latlng, {
      radius: 9,
      color: "#fff",
      weight: 2,
      fillColor: "#2563eb",
      fillOpacity: 1,
    }).addTo(map);
    userMarker.bindPopup("Your location").openPopup();

    const names = pointInSafeWake(latlng.lng, latlng.lat, window._safeWakeFc);
    if (names && names.length > 0) {
      setStatus(
        "Your location appears inside a precomputed safe wake zone on: " +
          names.join(", ") +
          ".",
      );
    } else {
      setStatus(
        "Your location is not inside any precomputed safe wake zone for this demo (or zones are unavailable for that lake).",
      );
    }
  }

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
      map.fitBounds(combined.getBounds().pad(0.08));
    })
    .catch(function (err) {
      setStatus("Could not load lake data: " + err.message);
      console.error(err);
    });

  document.getElementById("btn-locate").addEventListener("click", function () {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not available in this browser.");
      return;
    }
    setStatus("Requesting location…");
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
        updateLocation(ll);
        map.setView(ll, 13);
      },
      function () {
        setStatus(
          "Location permission denied or unavailable. Allow location for this site (HTTPS may be required).",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
})();
