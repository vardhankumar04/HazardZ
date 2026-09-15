/**
 * Leaflet Map Controller for HazardZ
 * Focus: Hyderabad Transit Network & Corridors
 */

let cityMap = null;
let hazardMarkersLayer = null;
let busMarkersLayer = null;
let corridorLinesLayer = null;

const busMarkersMap = {};
const hazardMarkersMap = {};

// Hyderabad City Center
const HYDERABAD_CENTER = [17.3850, 78.4867];

function initHazardMap() {
  if (cityMap) return;

  const mapContainer = document.getElementById('leaflet-city-map');
  if (!mapContainer) return;

  cityMap = L.map('leaflet-city-map', {
    center: HYDERABAD_CENTER,
    zoom: 13,
    zoomControl: false,
    attributionControl: false
  });

  // Top-right custom zoom control
  L.control.zoom({ position: 'topright' }).addTo(cityMap);

  // CartoDB Dark Matter tiles (sleek dark mode for high-contrast command centers)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(cityMap);

  hazardMarkersLayer = L.layerGroup().addTo(cityMap);
  busMarkersLayer = L.layerGroup().addTo(cityMap);
  corridorLinesLayer = L.layerGroup().addTo(cityMap);

  renderTransitCorridors();
}

// Transit corridors (Hyderabad arteries matching routes)
const CORRIDORS = [
  {
    name: "Afzal Gunj - Koti Arterial (Route 47L)",
    color: "#ef4444", // High risk / high hazards
    coords: [
      [17.3750, 78.4740],
      [17.3820, 78.4810],
      [17.3912, 78.4905],
      [17.3980, 78.4980],
      [17.4045, 78.5020]
    ]
  },
  {
    name: "Nampally - Charminar Heritage Link (Route 9M)",
    color: "#f59e0b", // Moderate risk
    coords: [
      [17.3980, 78.4680],
      [17.3900, 78.4710],
      [17.3820, 78.4715],
      [17.3680, 78.4735],
      [17.3616, 78.4747]
    ]
  },
  {
    name: "Musheerabad - Puranapul South Line (Route 8R)",
    color: "#ef4444", // High risk
    coords: [
      [17.4200, 78.5000],
      [17.4050, 78.4950],
      [17.3880, 78.4890],
      [17.3735, 78.4812],
      [17.3600, 78.4650]
    ]
  },
  {
    name: "Lakdikapul - Secretariat Express (Route 127)",
    color: "#10b981", // Healthy road condition
    coords: [
      [17.4060, 78.4620],
      [17.4120, 78.4680],
      [17.4180, 78.4740],
      [17.4250, 78.4790],
      [17.4320, 78.4850]
    ]
  }
];

function renderTransitCorridors() {
  corridorLinesLayer.clearLayers();

  // Try fetching dynamic street-accurate routes from OpenRouteService API
  fetch('/api/routes/directions')
    .then(res => res.json())
    .then(data => {
      if (data.corridors && Object.keys(data.corridors).length > 0) {
        Object.entries(data.corridors).forEach(([busId, corridor]) => {
          let color = "#38bdf8";
          if (busId.includes("4012") || busId.includes("1042")) color = "#ef4444"; // High hazard zones
          else if (busId.includes("3108")) color = "#f59e0b";
          else if (busId.includes("5221")) color = "#10b981";

          const polyline = L.polyline(corridor.coordinates, {
            color: color,
            weight: 4,
            opacity: 0.85,
            dashArray: color === "#10b981" ? null : "6, 8"
          }).addTo(corridorLinesLayer);

          const tooltipMsg = `
            <strong>${corridor.road_name}</strong><br>
            <span>Route: ${corridor.route_number} • ${corridor.distance_km} km • ~${corridor.duration_min} min</span><br>
            <span style="font-size: 10px; color: #38bdf8;">Geometry: ${corridor.source}</span>
          `;
          polyline.bindTooltip(tooltipMsg, { sticky: true, className: 'leaflet-tooltip-dark' });
        });
        return;
      }
      renderStaticCorridorsFallback();
    })
    .catch(() => {
      renderStaticCorridorsFallback();
    });
}

function renderStaticCorridorsFallback() {
  corridorLinesLayer.clearLayers();
  CORRIDORS.forEach(corridor => {
    const polyline = L.polyline(corridor.coords, {
      color: corridor.color,
      weight: 4,
      opacity: 0.75,
      dashArray: corridor.color === "#10b981" ? null : "6, 8"
    }).addTo(corridorLinesLayer);

    polyline.bindTooltip(corridor.name, {
      sticky: true,
      className: 'leaflet-tooltip-dark'
    });
  });
}

function updateMapHazards(hazards) {
  if (!cityMap || !hazardMarkersLayer) return;

  // Clear previous markers
  hazardMarkersLayer.clearLayers();

  hazards.forEach(hazard => {
    const iconHtml = getHazardIconHtml(hazard.hazard_type, hazard.severity);
    const customIcon = L.divIcon({
      html: iconHtml,
      className: 'custom-hazard-div-icon',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -18]
    });

    const marker = L.marker([hazard.latitude, hazard.longitude], { icon: customIcon });

    // Popup content
    const popupContent = `
      <div style="font-family: 'Inter', sans-serif; min-width: 220px; color: #f8fafc;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
          <span style="font-weight:700; font-size:13px; color:#fff;">${hazard.hazard_type}</span>
          <span style="font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; background:${getSeverityColor(hazard.severity)}; color:#fff;">
            ${hazard.severity} (${hazard.severity_score}/10)
          </span>
        </div>
        <div style="font-size:11px; color:#94a3b8; margin-bottom: 4px;">📍 ${hazard.road_name}</div>
        <div style="font-size:11px; color:#94a3b8; margin-bottom: 8px;">🚌 Detected by: <strong>${hazard.bus_id}</strong></div>
        <div style="font-size:11px; color:#38bdf8; margin-bottom: 10px;">🎯 Confidence: ${Math.round(hazard.confidence * 100)}%</div>
        <button onclick="openDispatchModal('${hazard.id}')" style="width:100%; background:#0284c7; color:#fff; border:none; border-radius:6px; padding:6px; font-size:11px; font-weight:600; cursor:pointer;">
          🚨 Dispatch Repair Crew
        </button>
      </div>
    `;

    marker.bindPopup(popupContent, {
      className: 'hazard-leaflet-popup'
    });

    marker.addTo(hazardMarkersLayer);
    hazardMarkersMap[hazard.id] = marker;
  });
}

function updateMapBuses(buses) {
  if (!cityMap || !busMarkersLayer) return;

  buses.forEach(bus => {
    const busId = bus.bus_id;
    const latLng = [bus.latitude, bus.longitude];

    if (busMarkersMap[busId]) {
      // Smoothly update position
      busMarkersMap[busId].setLatLng(latLng);
    } else {
      const busIconHtml = `
        <div class="bus-map-marker" title="${bus.bus_id} (${bus.route_number})">
          🚌
        </div>
      `;
      const customBusIcon = L.divIcon({
        html: busIconHtml,
        className: 'custom-bus-div-icon',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
      });

      const marker = L.marker(latLng, { icon: customBusIcon });
      marker.bindPopup(`
        <div style="font-family: 'Inter', sans-serif; min-width: 200px; color: #fff;">
          <strong style="font-size:13px; color:#38bdf8;">${bus.bus_id}</strong>
          <div style="font-size:11px; color:#94a3b8; margin: 4px 0;">Route: ${bus.route_number}</div>
          <div style="font-size:11px; color:#94a3b8;">Speed: ${bus.speed_kmh} km/h</div>
          <div style="font-size:11px; color:#10b981; margin-top:4px;">● AI Dashcam Edge Unit Active</div>
        </div>
      `);
      marker.addTo(busMarkersLayer);
      busMarkersMap[busId] = marker;
    }
  });
}

function focusOnHazard(hazardId, lat, lon) {
  if (!cityMap) return;
  cityMap.flyTo([lat, lon], 16, { duration: 0.8 });
  if (hazardMarkersMap[hazardId]) {
    hazardMarkersMap[hazardId].openPopup();
  }
}

function recenterMap() {
  if (!cityMap) return;
  cityMap.flyTo(HYDERABAD_CENTER, 13, { duration: 0.8 });
}

function toggleLayer(layerName) {
  const btn = document.getElementById(`btn-toggle-${layerName}`);
  if (!btn) return;

  let layer = null;
  if (layerName === 'buses') layer = busMarkersLayer;
  if (layerName === 'hazards') layer = hazardMarkersLayer;
  if (layerName === 'corridors') layer = corridorLinesLayer;

  if (!layer) return;

  if (cityMap.hasLayer(layer)) {
    cityMap.removeLayer(layer);
    btn.classList.remove('active');
  } else {
    cityMap.addLayer(layer);
    btn.classList.add('active');
  }
}

function getHazardIconHtml(type, severity) {
  let symbol = "⚠️";
  if (type === "Pothole") symbol = "🕳️";
  else if (type === "Waterlogging") symbol = "🌊";
  else if (type === "Road Crack") symbol = "⚡";
  else if (type.includes("Obstacle") || type.includes("Debris")) symbol = "🚧";

  const sevClass = severity.toLowerCase();
  return `<div class="hazard-map-marker ${sevClass}">${symbol}</div>`;
}

function getSeverityColor(sev) {
  switch (sev) {
    case 'CRITICAL': return '#ef4444';
    case 'HIGH': return '#f97316';
    case 'MEDIUM': return '#eab308';
    case 'LOW': return '#06b6d4';
    default: return '#64748b';
  }
}
