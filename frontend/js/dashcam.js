/**
 * Bus In-Cab Dashcam & AI YOLO HUD Simulator
 * Renders animated road drive, AI bounding boxes, weather shaders & HUD telemetry
 */

let dashcamCanvas = null;
let dashcamCtx = null;
let animationFrameId = null;

let currentBusId = "TS-09-UB-4012";
let currentBusTelemetry = {
  speed: 38,
  heading: 45,
  lat: 17.3912,
  lon: 78.4905,
  road: "Afzal Gunj - Koti Corridor",
  route: "Route 47L"
};

let storeAndForwardActive = false;
let bufferedEventsCount = 0;
let isWebcamActive = false;
let webcamStream = null;
let customImageElement = null;

// Dynamic road state for continuous simulation
let roadOffset = 0;
let activeRoadHazards = [];
let detectionFlashTimer = null;

function initDashcamSimulator() {
  dashcamCanvas = document.getElementById('dashcam-canvas');
  if (!dashcamCanvas) return;
  dashcamCtx = dashcamCanvas.getContext('2d');

  // Spawn initial hazard on road
  spawnRoadHazard("Pothole", "CRITICAL", 9.2, 0.94);

  // Start continuous render loop
  if (!animationFrameId) {
    renderDashcamLoop();
  }
}

function spawnRoadHazard(type, severity, score, confidence) {
  activeRoadHazards.push({
    type: type,
    severity: severity,
    score: score,
    confidence: confidence,
    z: 0.1, // Progress towards camera (0.0 horizon to 1.0 windshield)
    laneOffset: (Math.random() - 0.5) * 0.7, // left/right lane
    w: 90,
    h: 50
  });
}

function renderDashcamLoop() {
  if (isWebcamActive) {
    renderWebcamFeed();
  } else if (customImageElement) {
    renderCustomImageFeed();
  } else {
    renderSimulatedRoadFeed();
  }

  animationFrameId = requestAnimationFrame(renderDashcamLoop);
}

function renderSimulatedRoadFeed() {
  const w = dashcamCanvas.width;
  const h = dashcamCanvas.height;
  const ctx = dashcamCtx;

  roadOffset = (roadOffset + (currentBusTelemetry.speed / 10)) % 60;

  // 1. Sky & Horizon
  const currentEnv = window.currentWeatherMode || "CLEAR";
  let skyGrad;

  if (currentEnv === "NIGHT") {
    skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.45);
    skyGrad.addColorStop(0, "#030712");
    skyGrad.addColorStop(1, "#0f172a");
  } else if (currentEnv === "RAIN") {
    skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.45);
    skyGrad.addColorStop(0, "#334155");
    skyGrad.addColorStop(1, "#475569");
  } else {
    skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.45);
    skyGrad.addColorStop(0, "#0284c7");
    skyGrad.addColorStop(1, "#bae6fd");
  }

  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h * 0.45);

  // Distant City Skyline Silhouette
  ctx.fillStyle = currentEnv === "NIGHT" ? "#090d16" : "#475569";
  for (let i = 0; i < 20; i++) {
    const bW = 35 + (i * 17) % 30;
    const bH = 30 + (i * 29) % 65;
    const bX = (i * 50);
    ctx.fillRect(bX, (h * 0.45) - bH, bW, bH);
  }

  // 2. Road Surface
  const horizonY = h * 0.45;
  const roadGrad = ctx.createLinearGradient(0, horizonY, 0, h);
  roadGrad.addColorStop(0, "#1e293b");
  roadGrad.addColorStop(1, "#0f172a");

  ctx.fillStyle = roadGrad;
  ctx.beginPath();
  ctx.moveTo(w * 0.38, horizonY);
  ctx.lineTo(w * 0.62, horizonY);
  ctx.lineTo(w * 0.95, h);
  ctx.lineTo(w * 0.05, h);
  ctx.closePath();
  ctx.fill();

  // Curbs / Sidewalk
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.38, horizonY);
  ctx.lineTo(w * 0.05, h);
  ctx.moveTo(w * 0.62, horizonY);
  ctx.lineTo(w * 0.95, h);
  ctx.stroke();

  // Dashed Lane Dividers (animated perspective)
  ctx.strokeStyle = currentEnv === "NIGHT" ? "#fef08a" : "#ffffff";
  ctx.lineWidth = 4;
  for (let i = 0; i < 7; i++) {
    const zProgress = ((i * 15 + roadOffset) % 100) / 100;
    if (zProgress < 0.05) continue;

    const segY = horizonY + (h - horizonY) * Math.pow(zProgress, 1.8);
    const segH = 20 * zProgress;
    const midX = w * 0.5;

    ctx.beginPath();
    ctx.moveTo(midX, segY);
    ctx.lineTo(midX, segY + segH);
    ctx.stroke();
  }

  // 3. Move and Draw Hazards on Road
  for (let i = activeRoadHazards.length - 1; i >= 0; i--) {
    const haz = activeRoadHazards[i];
    haz.z += 0.007 * (currentBusTelemetry.speed / 30);

    // Compute screen position based on perspective
    const yPos = horizonY + (h - horizonY) * Math.pow(haz.z, 1.6);
    const roadHalfWidth = (w * 0.45) * Math.pow(haz.z, 1.6);
    const xPos = (w * 0.5) + (haz.laneOffset * roadHalfWidth);

    const scale = Math.pow(haz.z, 1.5) * 1.8;
    const currentW = haz.w * scale;
    const currentH = haz.h * scale;

    if (haz.z < 1.05) {
      drawHazardGraphic(ctx, haz.type, xPos - currentW / 2, yPos - currentH / 2, currentW, currentH);
      drawYoloBoundingBox(ctx, haz, xPos - currentW / 2, yPos - currentH / 2, currentW, currentH);
    } else {
      // Hazard passed windshield, remove it
      activeRoadHazards.splice(i, 1);
    }
  }

  // Randomly spawn new hazard if none on screen
  if (activeRoadHazards.length === 0 && Math.random() < 0.04) {
    const types = ["Pothole", "Waterlogging", "Road Crack", "Obstacle / Debris"];
    const chosenType = types[Math.floor(Math.random() * types.length)];
    let sev = "HIGH";
    let score = 7.8;
    if (chosenType === "Pothole") { sev = "CRITICAL"; score = 9.1; }
    else if (chosenType === "Road Crack") { sev = "LOW"; score = 3.6; }
    else if (chosenType === "Obstacle / Debris") { sev = "CRITICAL"; score = 9.5; }
    spawnRoadHazard(chosenType, sev, score, (0.85 + Math.random() * 0.12));
  }

  // 4. Weather Shaders (Rain / Night)
  if (currentEnv === "RAIN") {
    drawRainShader(ctx, w, h);
  } else if (currentEnv === "NIGHT") {
    drawNightShader(ctx, w, h);
  }
}

function drawHazardGraphic(ctx, type, x, y, w, h) {
  if (type === "Pothole") {
    // Deep dark crater with irregular rim
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2.3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(100, 116, 139, 0.6)";
    ctx.lineWidth = 3;
    ctx.stroke();
  } else if (type === "Waterlogging") {
    // Reflective watery pool
    ctx.fillStyle = "rgba(56, 189, 248, 0.45)";
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ripple
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (type === "Road Crack") {
    // Jagged crack lines
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(2, w * 0.04);
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.2);
    ctx.lineTo(x + w * 0.3, y + h * 0.6);
    ctx.lineTo(x + w * 0.7, y + h * 0.4);
    ctx.lineTo(x + w, y + h * 0.8);
    ctx.stroke();
  } else {
    // Obstacle / Debris
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(x, y, w * 0.7, h * 0.8);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w * 0.7, h * 0.8);
  }
}

function drawYoloBoundingBox(ctx, haz, x, y, w, h) {
  // Color based on severity
  let color = "#ef4444";
  if (haz.severity === "HIGH") color = "#f97316";
  else if (haz.severity === "MEDIUM") color = "#eab308";
  else if (haz.severity === "LOW") color = "#06b6d4";

  // Box border
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x, y, w, h);

  // High-Tech Corner Brackets
  const cornerLen = Math.min(12, w * 0.25);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;

  // Top-left
  ctx.beginPath();
  ctx.moveTo(x, y + cornerLen);
  ctx.lineTo(x, y);
  ctx.lineTo(x + cornerLen, y);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.moveTo(x + w - cornerLen, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + cornerLen);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(x, y + h - cornerLen);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + cornerLen, y + h);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(x + w - cornerLen, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y + h - cornerLen);
  ctx.stroke();

  // YOLO Class Label Tag
  const labelText = `${haz.type.toUpperCase()} ${(haz.confidence * 100).toFixed(0)}% [${haz.severity}]`;
  ctx.font = "bold 11px 'JetBrains Mono', monospace";
  const textMetrics = ctx.measureText(labelText);
  const tagW = textMetrics.width + 12;
  const tagH = 18;

  ctx.fillStyle = color;
  ctx.fillRect(x, Math.max(0, y - tagH), tagW, tagH);

  ctx.fillStyle = "#ffffff";
  ctx.fillText(labelText, x + 6, Math.max(13, y - 4));
}

function drawRainShader(ctx, w, h) {
  ctx.strokeStyle = "rgba(186, 230, 253, 0.4)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) {
    const rx = Math.random() * w;
    const ry = Math.random() * h;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 8, ry + 22);
    ctx.stroke();
  }
}

function drawNightShader(ctx, w, h) {
  // Vignette darkness with headlight cones
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.8, 50, w * 0.5, h * 0.8, w * 0.6);
  grad.addColorStop(0, "rgba(254, 240, 138, 0.15)");
  grad.addColorStop(0.5, "rgba(0, 0, 0, 0.3)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.75)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function renderCustomImageFeed() {
  if (!customImageElement || !dashcamCtx) return;
  const w = dashcamCanvas.width;
  const h = dashcamCanvas.height;
  dashcamCtx.drawImage(customImageElement, 0, 0, w, h);

  // Draw simulated detection on custom image
  const demoHaz = {
    type: "Pothole",
    severity: "CRITICAL",
    score: 9.3,
    confidence: 0.95
  };
  drawYoloBoundingBox(dashcamCtx, demoHaz, w * 0.35, h * 0.55, w * 0.3, h * 0.25);
}

function renderWebcamFeed() {
  const video = document.getElementById('webcam-video');
  if (!video || !dashcamCtx || video.readyState < 2) return;
  const w = dashcamCanvas.width;
  const h = dashcamCanvas.height;
  dashcamCtx.drawImage(video, 0, 0, w, h);

  // Real-time reticle on center
  const demoHaz = {
    type: "Obstacle / Debris",
    severity: "HIGH",
    score: 8.1,
    confidence: 0.88
  };
  drawYoloBoundingBox(dashcamCtx, demoHaz, w * 0.3, h * 0.4, w * 0.4, h * 0.3);
}

function triggerDetectionFlash(hazard) {
  const banner = document.getElementById('hud-detection-banner');
  const title = document.getElementById('hud-alert-title');
  const sub = document.getElementById('hud-alert-sub');
  const audio = document.getElementById('audio-alert');

  if (!banner) return;

  if (title) title.textContent = `${hazard.hazard_type.toUpperCase()} DETECTED [${hazard.severity}]`;
  if (sub) sub.textContent = `Confidence: ${Math.round(hazard.confidence * 100)}% • ${hazard.road_name} • Streamed`;

  banner.classList.add('active');

  // Play synthetic alert beep
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  // Also immediately push to canvas hazard queue
  spawnRoadHazard(hazard.hazard_type, hazard.severity, hazard.severity_score, hazard.confidence);

  if (detectionFlashTimer) clearTimeout(detectionFlashTimer);
  detectionFlashTimer = setTimeout(() => {
    banner.classList.remove('active');
  }, 4000);
}

function changeDashcamBus(busId) {
  currentBusId = busId;
  const busElem = document.getElementById('hud-bus-id');
  if (busElem) busElem.textContent = busId;

  // Update telemetry display
  if (window.latestFleetData && window.latestFleetData.buses) {
    const bus = window.latestFleetData.buses.find(b => b.bus_id === busId);
    if (bus) updateDashcamTelemetry(bus);
  }
}

function updateDashcamTelemetry(bus) {
  currentBusTelemetry.speed = bus.speed_kmh;
  currentBusTelemetry.heading = bus.heading;
  currentBusTelemetry.lat = bus.latitude;
  currentBusTelemetry.lon = bus.longitude;

  const spd = document.getElementById('hud-speed');
  const hdg = document.getElementById('hud-heading');
  const coords = document.getElementById('hud-coords');
  const road = document.getElementById('hud-bus-road');
  const route = document.getElementById('hud-bus-route');

  if (spd) spd.textContent = Math.round(bus.speed_kmh);
  if (hdg) hdg.textContent = `${Math.round(bus.heading).toString().padStart(3, '0')}°`;
  if (coords) coords.textContent = `${bus.latitude.toFixed(5)}° N, ${bus.longitude.toFixed(5)}° E`;
  if (road && bus.road_name) road.textContent = bus.road_name;
  if (route && bus.route_number) route.textContent = bus.route_number;
}

// Slide 4 Challenge: Store-and-Forward Offline Connectivity Toggle
function toggleStoreAndForward() {
  storeAndForwardActive = !storeAndForwardActive;
  const btn = document.getElementById('btn-toggle-offline');
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  const queueBadge = document.getElementById('sync-queue-badge');
  const hudSync = document.getElementById('hud-sync-status');

  fetch('/api/fleet/store-and-forward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bus_id: currentBusId,
      enabled: storeAndForwardActive
    })
  })
  .then(res => res.json())
  .then(data => {
    if (storeAndForwardActive) {
      btn.classList.remove('active');
      dot.className = 'status-dot offline';
      text.textContent = 'Tunnel / Offline (Buffered)';
      hudSync.textContent = 'Store & Forward (NVRAM)';
      hudSync.className = 'text-amber font-mono';
    } else {
      btn.classList.add('active');
      dot.className = 'status-dot online';
      text.textContent = 'Connected (Live Stream)';
      hudSync.textContent = '5G Real-time';
      hudSync.className = 'text-cyan font-mono';
      queueBadge.textContent = '0 buffered';
      
      // Refresh alerts if items flushed
      if (data.flushed_events > 0) {
        window.fetchHazards();
        alert(`🛰️ Reconnected! Synced ${data.flushed_events} buffered hazard events to Municipal Central.`);
      }
    }
  });
}

function handleCustomFrameUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      customImageElement = img;
      isWebcamActive = false;
      stopWebcamStream();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function toggleWebcam() {
  const btn = document.getElementById('btn-webcam');
  const video = document.getElementById('webcam-video');

  if (isWebcamActive) {
    stopWebcamStream();
    isWebcamActive = false;
    btn.textContent = '📹 Web Camera';
    btn.classList.remove('btn-accent');
  } else {
    customImageElement = null;
    navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540 } })
      .then(stream => {
        webcamStream = stream;
        video.srcObject = stream;
        video.play();
        isWebcamActive = true;
        btn.textContent = '⏹️ Stop Camera';
        btn.classList.add('btn-accent');
      })
      .catch(err => {
        alert('Webcam access was denied or not available. Running simulated dashcam stream.');
      });
  }
}

function stopWebcamStream() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
}
