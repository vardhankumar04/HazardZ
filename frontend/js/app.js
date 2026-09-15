/**
 * Main Application Controller for HazardZ
 * Smart India Hackathon 2026 • Team Chillchat
 */

window.currentSeverityFilter = "ALL";
window.currentWeatherMode = "CLEAR";
window.isSimulationRunning = true;
window.latestFleetData = null;
window.allHazardsList = [];
window.selectedHazardForModal = null;

let simulationInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Map and Dashcam
  initHazardMap();
  initDashcamSimulator();

  // 2. Fetch Initial Data
  fetchHazards();
  fetchFleetData();
  fetchAnalytics();
  checkRouteKeyStatus();

  // 3. Start Auto-Simulation Loop (Fleet movement + telemetry)
  startSimulationLoop();
});

// Tab Navigation View Switcher
function switchView(viewId) {
  // Update Tab buttons
  document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
  const activeTab = document.getElementById(`tab-${viewId}`);
  if (activeTab) activeTab.classList.add('active');

  // Update View Panels
  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
  const activePanel = document.getElementById(`view-${viewId}`);
  if (activePanel) activePanel.classList.add('active');

  // If switched to command center, invalidate map size for crisp render
  if (viewId === 'command-center' && cityMap) {
    setTimeout(() => cityMap.invalidateSize(), 200);
  }
}

// Weather / Lighting Filter Toggle (Slide 4 Challenge Mitigation)
function setWeather(mode) {
  window.currentWeatherMode = mode;
  document.querySelectorAll('.weather-btn').forEach(btn => btn.classList.remove('active'));

  const activeBtn = document.getElementById(`btn-weather-${mode.toLowerCase()}`);
  if (activeBtn) activeBtn.classList.add('active');

  const hudThreshold = document.getElementById('hud-threshold');
  if (mode === "RAIN" && hudThreshold) {
    hudThreshold.textContent = "0.78 (Rain Filter +8%)";
  } else if (mode === "NIGHT" && hudThreshold) {
    hudThreshold.textContent = "0.75 (Night Filter +5%)";
  } else if (hudThreshold) {
    hudThreshold.textContent = "0.70 (Standard)";
  }

  fetch('/api/fleet/weather', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weather_mode: mode })
  }).catch(err => console.error("Error setting weather:", err));
}

// Fleet Simulation Loop
function startSimulationLoop() {
  if (simulationInterval) clearInterval(simulationInterval);
  simulationInterval = setInterval(() => {
    if (!window.isSimulationRunning) return;

    fetch('/api/fleet/simulate-tick', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.buses) {
          window.latestFleetData = data;
          updateMapBuses(data.buses);
          updateFleetTable(data.buses);

          // Update Dashcam HUD if matching current selected bus
          const activeDashcamBus = data.buses.find(b => b.bus_id === currentBusId);
          if (activeDashcamBus) {
            updateDashcamTelemetry(activeDashcamBus);
          }
        }
      })
      .catch(err => console.error("Sim tick error:", err));
  }, 1800);
}

function toggleFleetSimulation() {
  window.isSimulationRunning = !window.isSimulationRunning;
  const btnText = document.getElementById('sim-btn-text');
  const indicator = document.getElementById('sim-indicator');

  if (window.isSimulationRunning) {
    btnText.textContent = "Fleet Auto-Drive: ON";
    indicator.className = "status-dot online";
  } else {
    btnText.textContent = "Fleet Auto-Drive: PAUSED";
    indicator.className = "status-dot offline";
  }
}

// Fetch & Display Prioritized Alerts
function fetchHazards() {
  const url = window.currentSeverityFilter === "ALL" 
    ? '/api/hazards' 
    : `/api/hazards?severity=${window.currentSeverityFilter}`;

  fetch(url)
    .then(res => res.json())
    .then(hazards => {
      window.allHazardsList = hazards;
      renderAlertsList(hazards);
      updateMapHazards(hazards);
      fetchAnalytics();
    })
    .catch(err => console.error("Fetch hazards error:", err));
}

function setSeverityFilter(severity) {
  window.currentSeverityFilter = severity;
  document.querySelectorAll('.filter-pill').forEach(pill => pill.classList.remove('active'));

  const activePill = document.getElementById(`filter-${severity.toLowerCase()}`);
  if (activePill) activePill.classList.add('active');

  fetchHazards();
}

function renderAlertsList(hazards) {
  const container = document.getElementById('alerts-list-container');
  const badge = document.getElementById('feed-count-badge');
  if (!container) return;

  if (badge) badge.textContent = `${hazards.length} Alerts`;

  if (hazards.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
        No active hazards found for this filter.
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  hazards.forEach(h => {
    const card = document.createElement('div');
    const sevLower = h.severity.toLowerCase();
    card.className = `alert-card ${sevLower}`;

    const timeAgo = formatTimeAgo(h.timestamp);

    card.innerHTML = `
      <div class="alert-card-top">
        <span class="hazard-badge badge-${sevLower}">${h.severity} (${h.severity_score}/10)</span>
        <span class="alert-status-pill status-${h.status}">● ${formatStatus(h.status)}</span>
      </div>

      <div class="alert-road">${h.hazard_type}: ${h.road_name}</div>

      <div class="alert-details-row">
        <span>📍 ${h.ward_zone}</span>
        <span style="font-family: var(--font-mono);">${timeAgo}</span>
      </div>

      <div class="alert-details-row">
        <span>🚌 ${h.bus_id}</span>
        <span style="color: var(--accent-cyan); font-weight:600;">Conf: ${Math.round(h.confidence * 100)}%</span>
      </div>

      ${h.assigned_contractor ? `<div style="font-size: 11px; color: #fbbf24;">🛠️ Assigned: ${h.assigned_contractor}</div>` : ''}

      <div class="alert-actions" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-secondary" onclick="focusOnHazard('${h.id}', ${h.latitude}, ${h.longitude})">
          🎯 View on Map
        </button>
        ${h.status !== 'RESOLVED' ? `
          <button class="btn btn-sm btn-accent" onclick="openDispatchModal('${h.id}')">
            🚨 Dispatch Crew
          </button>
          <button class="btn btn-sm btn-outline" onclick="markHazardResolved('${h.id}')">
            ✓ Repaired
          </button>
        ` : `
          <span style="font-size:11px; color:var(--color-emerald); font-weight:600; padding:4px 0;">✓ Repaired & Audited</span>
        `}
      </div>
    `;

    // Clicking card centers on map
    card.addEventListener('click', () => {
      focusOnHazard(h.id, h.latitude, h.longitude);
    });

    container.appendChild(card);
  });
}

// Instant Trigger Edge Detection (Simulate Bus Cam spotting a hazard)
function triggerSimulatedDetection() {
  fetch('/api/fleet/trigger-detection', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      const h = data.hazard;
      triggerDetectionFlash(h);
      fetchHazards();

      if (data.status === "BUFFERED_OFFLINE") {
        alert(data.message);
        const queueBadge = document.getElementById('sync-queue-badge');
        if (queueBadge) queueBadge.textContent = "1 buffered";
      }
    })
    .catch(err => console.error("Trigger detection error:", err));
}

// Work Order & Dispatch Modal Handlers
function openDispatchModal(hazardId) {
  const hazard = window.allHazardsList.find(h => h.id === hazardId);
  if (!hazard) return;

  window.selectedHazardForModal = hazard;

  const modal = document.getElementById('modal-dispatch');
  document.getElementById('modal-hazard-id').textContent = hazard.id;
  document.getElementById('modal-hazard-type').textContent = hazard.hazard_type;
  document.getElementById('modal-hazard-location').textContent = hazard.road_name;
  document.getElementById('modal-hazard-coords').textContent = `${hazard.latitude}, ${hazard.longitude}`;
  document.getElementById('modal-hazard-bus').textContent = hazard.bus_id;

  const sevElem = document.getElementById('modal-hazard-severity');
  sevElem.textContent = `${hazard.severity} (${hazard.severity_score}/10)`;
  sevElem.className = `badge-${hazard.severity.toLowerCase()}`;

  // Draw simulated thumbnail on modal canvas
  drawModalThumbnail(hazard);

  modal.classList.add('open');
}

function closeDispatchModal() {
  const modal = document.getElementById('modal-dispatch');
  if (modal) modal.classList.remove('open');
  window.selectedHazardForModal = null;
}

function drawModalThumbnail(hazard) {
  const canvas = document.getElementById('modal-hazard-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Road backdrop
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, w, h);

  // Road lines
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.4, 0);
  ctx.lineTo(w * 0.1, h);
  ctx.moveTo(w * 0.6, 0);
  ctx.lineTo(w * 0.9, h);
  ctx.stroke();

  // Draw hazard item
  drawHazardGraphic(ctx, hazard.hazard_type, w * 0.35, h * 0.45, w * 0.3, h * 0.3);

  // Bounding box overlay
  ctx.strokeStyle = getSeverityColor(hazard.severity);
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.3, h * 0.38, w * 0.4, h * 0.45);

  ctx.fillStyle = getSeverityColor(hazard.severity);
  ctx.fillRect(w * 0.3, h * 0.38 - 16, w * 0.4, 16);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 9px 'JetBrains Mono'";
  ctx.fillText(`${hazard.hazard_type.toUpperCase()} ${Math.round(hazard.confidence * 100)}%`, w * 0.3 + 4, h * 0.38 - 4);
}

function submitDispatch(event) {
  event.preventDefault();
  if (!window.selectedHazardForModal) return;

  const contractor = document.getElementById('select-contractor').value;
  const notes = document.getElementById('input-repair-notes').value || "Dispatched via SIH Municipal Authority Command.";

  fetch(`/api/hazards/${window.selectedHazardForModal.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'CREW_DISPATCHED',
      contractor: contractor,
      notes: notes,
      actor: "Municipal Dispatcher"
    })
  })
  .then(res => res.json())
  .then(() => {
    closeDispatchModal();
    fetchHazards();
    alert(`🚨 Work order issued! ${contractor} has been dispatched to ${window.selectedHazardForModal.road_name}.`);
  })
  .catch(err => console.error("Dispatch error:", err));
}

function markHazardVerified() {
  if (!window.selectedHazardForModal) return;

  fetch(`/api/hazards/${window.selectedHazardForModal.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'VERIFIED',
      actor: "Quality Inspector"
    })
  })
  .then(res => res.json())
  .then(() => {
    closeDispatchModal();
    fetchHazards();
  });
}

function markHazardResolved(hazardId) {
  if (!confirm("Confirm that this road hazard has been repaired and cold-patched?")) return;

  fetch(`/api/hazards/${hazardId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'RESOLVED',
      actor: "Field Crew Supervisor",
      notes: "Repaired, compacted, and verified road clearance."
    })
  })
  .then(res => res.json())
  .then(() => {
    fetchHazards();
  });
}

// Fetch Fleet & Telemetry
function fetchFleetData() {
  fetch('/api/fleet/live')
    .then(res => res.json())
    .then(data => {
      window.latestFleetData = data;
      updateMapBuses(data.buses);
      updateFleetTable(data.buses);
    })
    .catch(err => console.error("Fetch fleet error:", err));
}

function updateFleetTable(buses) {
  const tbody = document.getElementById('fleet-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  buses.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${b.bus_id}</strong></td>
      <td><span class="badge-accent" style="font-size:11px; padding:2px 6px;">${b.route_number}</span></td>
      <td>${b.driver_name || 'Assigned Driver'}</td>
      <td>${b.road_name || 'City Arterial'}</td>
      <td class="font-mono" style="font-size:11px;">${b.latitude.toFixed(4)}, ${b.longitude.toFixed(4)}</td>
      <td class="font-mono">${b.speed_kmh} km/h</td>
      <td><strong style="color:var(--sev-high);">${b.hazards_detected_today || 0}</strong></td>
      <td class="font-mono">${b.distance_covered_km.toFixed(1)} km</td>
      <td>
        <span class="status-dot ${b.is_offline_buffer ? 'offline' : 'online'}"></span>
        <span style="font-size:11px;">${b.is_offline_buffer ? 'Buffered (Offline)' : 'Active (5G)'}</span>
      </td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="switchView('dashcam'); changeDashcamBus('${b.bus_id}')">
          👁️ Dashcam
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Fetch Analytics Summary
function fetchAnalytics() {
  fetch('/api/analytics')
    .then(res => res.json())
    .then(data => {
      updateAnalyticsUI(data);
    })
    .catch(err => console.error("Fetch analytics error:", err));
}

// Utility Helpers
function formatTimeAgo(timestamp) {
  const diffSec = Math.floor(Date.now() / 1000 - timestamp);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

function formatStatus(status) {
  switch (status) {
    case 'NEW': return 'Unverified Alert';
    case 'VERIFIED': return 'Confirmed by AI';
    case 'CREW_DISPATCHED': return 'Crew En Route';
    case 'RESOLVED': return 'Resolved / Repaired';
    default: return status;
  }
}

// OpenRouteService / OpenMapRoute Key Modal & Config
function openRouteKeyModal() {
  const modal = document.getElementById('modal-route-api');
  if (modal) modal.classList.add('open');
  checkRouteKeyStatus();
}

function closeRouteKeyModal() {
  const modal = document.getElementById('modal-route-api');
  if (modal) modal.classList.remove('open');
}

function checkRouteKeyStatus() {
  fetch('/api/routes/config')
    .then(res => res.json())
    .then(data => {
      const dot = document.getElementById('route-key-dot');
      const text = document.getElementById('route-key-text');
      const statusLbl = document.getElementById('modal-route-status');
      const keyLbl = document.getElementById('modal-route-masked-key');

      if (data.is_configured) {
        if (dot) dot.className = 'status-dot online';
        if (text) text.textContent = 'OpenRoute: Active';
        if (statusLbl) {
          statusLbl.textContent = 'Active (OpenRouteService Connected)';
          statusLbl.style.color = 'var(--color-emerald)';
        }
        if (keyLbl) keyLbl.textContent = data.masked_key;
      } else {
        if (dot) dot.className = 'status-dot offline';
        if (text) text.textContent = 'OpenRoute Key';
        if (statusLbl) {
          statusLbl.textContent = 'Using Free OSRM Fallback (No Key Set)';
          statusLbl.style.color = 'var(--sev-high)';
        }
        if (keyLbl) keyLbl.textContent = 'Not Configured';
      }
    })
    .catch(err => console.error("Error checking route config:", err));
}

function saveRouteApiKey(event) {
  event.preventDefault();
  const input = document.getElementById('input-openroute-key');
  if (!input || !input.value.trim()) return;

  const key = input.value.trim();
  const saveBtn = document.getElementById('btn-save-route-key');
  if (saveBtn) saveBtn.textContent = 'Connecting & Testing...';

  fetch('/api/routes/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key })
  })
    .then(res => res.json())
    .then(data => {
      if (saveBtn) saveBtn.textContent = '💾 Attach & Activate Route API';
      alert('✅ OpenRouteService API key attached and activated! Recalculating road navigation corridors.');
      closeRouteKeyModal();
      checkRouteKeyStatus();
      if (typeof renderTransitCorridors === 'function') {
        renderTransitCorridors();
      }
    })
    .catch(err => {
      if (saveBtn) saveBtn.textContent = '💾 Attach & Activate Route API';
      alert('Error saving route key: ' + err);
    });
}
