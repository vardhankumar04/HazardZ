# HazardZ — AI-Powered Mobile Urban Intelligence Platform
### Smart India Hackathon 2026 | Team: Chillchat
**Theme:** Smart City / Urban Infrastructure  
**Problem Statement:** AI-Powered Mobile Urban Intelligence Platform Using Public Transport Fleet  

> *"Turning public buses into mobile road-intelligence units."*

---

## 🎯 Project Overview & Solution Architecture

**HazardZ** eliminates the need for expensive, dedicated road inspection fleets. By mounting AI-enabled camera units on public transport buses already traveling regular city routes, the platform continuously senses, geo-tags, and triages road defects in real time.

```
[ Public Bus Dashcam ] ──> [ Edge AI / YOLOv8 Detection ] ──> [ Geo-Tagging & Severity Engine ]
                                                                             │
                                                                             ▼ (4G/5G or Store-and-Forward)
[ Municipal Command Center ] <── [ Leaflet Dark Map ] <── [ FastAPI Cloud Event Store (SQLite) ]
         │
         ├──> [ Severity Prioritization Feed: Critical -> High -> Medium -> Low ]
         └──> [ PWD Repair Crew Work Order Dispatch & Verification ]
```

---

## 📋 Direct Alignment with SIH Presentation Deck

| Slide # | Deck Concept | How It's Implemented in This Prototype |
| :--- | :--- | :--- |
| **Slide 1** | *Title & Vision* | Turning public buses into mobile road-intelligence units. |
| **Slide 2** | *Problem & Uniqueness* | Automatic road defect sensing with zero dedicated inspection fleets. |
| **Slide 3** | *Technical Approach* | **AI/CV:** YOLO-style detector with bounding boxes.<br>**Location:** Real-time GPS & heading telemetry.<br>**Backend:** Python FastAPI with SQLite persistence.<br>**Mapping:** Dynamic OpenStreetMap with color-coded severity.<br>**Alerts:** Municipal priority triage. |
| **Slide 4** | *Challenges & Mitigations* | **Lighting / Weather:** Interactive toggle for Clear ☀️ / Rain 🌧️ (+8% confidence filter) / Night 🌙 (+5% filter).<br>**False Detections:** Multi-frame validation buffer.<br>**Connectivity:** Store-and-Forward offline toggle emulating NVRAM queuing during underpass/tunnel blackouts. |
| **Slide 5** | *Impact & Prioritization* | Real-time sorting: *"Authorities see what needs attention first — not just what was reported last."* Includes PWD crew dispatch modal and repair audit log. |
| **Slide 6** | *References & Scope* | YOLO / OpenCV detection paradigm, Leaflet/OSM, FastAPI endpoints, and OpenRouteService (ORS) / OpenMapRoute API for live street-accurate routing. |

---

## 🔑 OpenRouteService / OpenMapRoute API Key Integration

The prototype supports live, street-accurate road routing via **OpenRouteService (ORS)**:
1. **In the Web UI**: Click the **"OpenRoute Key"** button in the top-right header to enter your API key and activate live OpenRouteService directions.
2. **Via `.env` file**: Open [`backend/.env`](file:///C:/Users/chind/.gemini/antigravity-ide/scratch/hazardz-prototype/backend/.env) and set:
   ```env
   OPENROUTESERVICE_API_KEY=your_key_here
   ```
3. **Free API Signup**: You can obtain a free API key at [openrouteservice.org/dev](https://openrouteservice.org/dev/#/signup).
4. **Zero-Config Fallback**: Even without an API key, the prototype automatically falls back to the Open Source Routing Machine (OSRM) engine to provide turn-by-turn road paths.

---

## 🚀 How to Run the Prototype

### Prerequisites
- Python 3.10+ (Python 3.13 tested and verified)
- Web Browser (Chrome, Edge, Firefox, Brave)

### Launching the Application
From the project root:
```powershell
# Using the project virtual environment
.venv\Scripts\python.exe run.py
```
Or directly with uvicorn:
```powershell
.venv\Scripts\uvicorn.exe backend.app:app --host 0.0.0.0 --port 8000 --reload
```

Once running, navigate to:  
👉 **`http://localhost:8000`**

---

## 🖥️ Demo Walkthrough Guide for SIH Judges

1. **Municipal Command Center (Tab 1)**:
   - Observe the **City Road Health Index** gauge (e.g. `82% Healthy`).
   - Watch the live Hyderabad map as public buses move along transit corridors (*Afzal Gunj, Nampally, Charminar, Tank Bund*).
   - Point out color-coded hazard markers with pulsing radar rings for **Critical** hazards.
   - Click any alert card in the **Priority Feed** to center on the hazard.
   - Click **🚨 Dispatch Crew** to assign a work order to GHMC / PWD rapid response units.
   - Click **✓ Repaired** to see the Road Health Index score dynamically increase.

2. **Bus In-Cab Edge AI Dashcam (Tab 2)**:
   - View the simulated bus dashcam feed showing perspective road motion.
   - Observe YOLO-style bounding boxes locking onto **Potholes**, **Waterlogging**, **Road Cracks**, and **Obstacles**.
   - Show the in-cab telemetry HUD (Speed, Heading, GPS Coordinates, Edge NPU Latency).
   - Click **📁 Upload Road Frame** or **📹 Web Camera** to run detection on external frames.
   - Demonstrate the **Slide 4 Mitigations**:
     - Switch environment to **Rain** or **Night** to see adaptive confidence thresholding.
     - Click **5G Cloud Sync** to enter *Tunnel / Offline mode* and watch detections buffer locally before flushing upon reconnection.

3. **Fleet Management (Tab 3)**:
   - Live telemetry roster of all sensing buses, kilometers scanned, and active status.

4. **SIH Blueprint (Tab 4)**:
   - Interactive presentation overview summarizing the hackathon problem statement, novelty, and architecture.
