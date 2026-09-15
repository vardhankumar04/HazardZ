"""
FastAPI Application for HazardZ Platform.
Exposes REST endpoints for:
- Fleet telemetry and live GPS tracking
- Edge hazard detection ingestion
- Authority prioritization, triage & work orders
- AI frame detection & weather mitigations
- Dynamic Road Health Index analytics
- Static frontend serving
"""

import os
import json
import time
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .database import (
    init_db,
    get_all_hazards,
    get_hazard_by_id,
    insert_hazard,
    update_hazard_status,
    get_all_buses,
    get_analytics_summary
)
from .ai_detector import detector
from .fleet_simulator import fleet_sim, BUS_ROUTES
from .routing_service import routing_service

# Initialize SQLite database schema and seed data
init_db()

app = FastAPI(
    title="HazardZ - AI Mobile Urban Intelligence Platform",
    description="Smart India Hackathon 2026 - Mobile Road Hazard Sensing via Public Transport Fleets",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic schemas for request validation
class HazardStatusUpdate(BaseModel):
    status: str # 'VERIFIED', 'CREW_DISPATCHED', 'RESOLVED'
    actor: str = "Municipal Control Room"
    contractor: Optional[str] = None
    notes: Optional[str] = None

class EdgeHazardIngest(BaseModel):
    hazard_type: str
    severity: str
    severity_score: float
    latitude: float
    longitude: float
    road_name: str
    ward_zone: str
    bus_id: str
    confidence: float
    bbox_data: Optional[str] = None
    notes: Optional[str] = None

class StoreForwardToggle(BaseModel):
    bus_id: str
    enabled: bool

class WeatherUpdate(BaseModel):
    weather_mode: str # 'CLEAR', 'RAIN', 'NIGHT'

class DetectFrameRequest(BaseModel):
    image_base64: Optional[str] = None
    weather_mode: Optional[str] = "CLEAR"

class ApiKeyPayload(BaseModel):
    api_key: str

# API Endpoints
@app.get("/api/hazards")
def list_hazards(severity: Optional[str] = None, status: Optional[str] = None):
    return get_all_hazards(severity=severity, status=status)

@app.get("/api/hazards/{hazard_id}")
def get_hazard(hazard_id: str):
    hazard = get_hazard_by_id(hazard_id)
    if not hazard:
        raise HTTPException(status_code=404, detail="Hazard not found")
    return hazard

@app.post("/api/hazards")
def ingest_hazard(payload: EdgeHazardIngest):
    now = time.time()
    hazard_id = f"HAZ-HYD-{int(now) % 10000}"
    data = payload.dict()
    data["id"] = hazard_id
    data["timestamp"] = now
    data["status"] = "NEW"
    data["assigned_contractor"] = None
    data["estimated_repair_hours"] = 6 if payload.severity == "CRITICAL" else 12
    data["image_url"] = f"/assets/{payload.hazard_type.lower().split()[0]}_sample.jpg"
    insert_hazard(data)
    return {"status": "success", "id": hazard_id, "data": data}

@app.patch("/api/hazards/{hazard_id}/status")
def update_status(hazard_id: str, payload: HazardStatusUpdate):
    hazard = get_hazard_by_id(hazard_id)
    if not hazard:
        raise HTTPException(status_code=404, detail="Hazard not found")
    update_hazard_status(
        hazard_id=hazard_id,
        new_status=payload.status,
        actor=payload.actor,
        contractor=payload.contractor,
        notes=payload.notes
    )
    return {"status": "success", "updated_hazard": get_hazard_by_id(hazard_id)}

@app.get("/api/fleet/live")
def get_live_fleet():
    buses = get_all_buses()
    # Enrich with route metadata
    enriched = []
    for b in buses:
        bus_dict = dict(b)
        bus_id = bus_dict["bus_id"]
        if bus_id in BUS_ROUTES:
            bus_dict["road_name"] = BUS_ROUTES[bus_id]["road_name"]
            bus_dict["ward_zone"] = BUS_ROUTES[bus_id]["ward_zone"]
        bus_dict["is_offline_buffer"] = fleet_sim.store_and_forward_enabled.get(bus_id, False)
        bus_dict["buffered_count"] = len(fleet_sim.offline_buffers.get(bus_id, []))
        enriched.append(bus_dict)
    return {
        "buses": enriched,
        "weather_mode": fleet_sim.weather_mode
    }

@app.post("/api/fleet/simulate-tick")
def simulate_tick():
    """
    Simulates one movement cycle of the fleet across the city.
    """
    result = fleet_sim.step_simulation()
    return result

@app.post("/api/fleet/trigger-detection")
def trigger_detection(bus_id: Optional[str] = None):
    """
    Triggers an edge AI detection from the specified or first active bus.
    """
    result = fleet_sim.trigger_edge_detection(bus_id=bus_id or "TS-09-UB-4012")
    return result

@app.post("/api/fleet/store-and-forward")
def toggle_store_and_forward(payload: StoreForwardToggle):
    flushed_count = fleet_sim.set_store_and_forward(payload.bus_id, payload.enabled)
    return {
        "bus_id": payload.bus_id,
        "store_and_forward_active": payload.enabled,
        "flushed_events": flushed_count,
        "message": f"Buffer synced {flushed_count} events to central" if flushed_count > 0 else ("Offline buffer enabled" if payload.enabled else "Online mode active")
    }

@app.post("/api/fleet/weather")
def update_weather(payload: WeatherUpdate):
    fleet_sim.set_weather_mode(payload.weather_mode)
    return {
        "weather_mode": fleet_sim.weather_mode,
        "detection_confidence_threshold": detector.base_confidence_threshold + (0.08 if payload.weather_mode == "RAIN" else (0.05 if payload.weather_mode == "NIGHT" else 0.0))
    }

@app.post("/api/detect")
def run_detector(payload: DetectFrameRequest):
    """
    Runs YOLO-style inference on frame with weather confidence thresholds.
    """
    res = detector.detect_frame(
        image_base64=payload.image_base64,
        weather_mode=payload.weather_mode or fleet_sim.weather_mode
    )
    return res

@app.get("/api/analytics")
def get_analytics():
    return get_analytics_summary()

@app.get("/api/routes/config")
def get_route_config():
    key = routing_service.api_key
    masked = f"••••••••••••{key[-4:]}" if len(key) >= 4 else ("Configured" if key else "Not Set")
    return {
        "is_configured": bool(key),
        "masked_key": masked,
        "provider": "OpenRouteService (openrouteservice.org) / OpenMapRoute"
    }

@app.post("/api/routes/config")
def set_route_config(payload: ApiKeyPayload):
    success = routing_service.save_api_key(payload.api_key)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save API key to .env")
    return {
        "status": "success",
        "message": "OpenRouteService API key saved successfully.",
        "is_configured": bool(routing_service.api_key)
    }

@app.get("/api/routes/directions")
def get_routes_directions():
    """
    Returns actual turn-by-turn road polyline coordinates for each bus transit corridor
    using OpenRouteService API (with OSRM fallback).
    """
    results = {}
    for bus_id, meta in BUS_ROUTES.items():
        res = routing_service.get_route_directions(meta["waypoints"])
        results[bus_id] = {
            "route_number": meta["route_number"],
            "road_name": meta["road_name"],
            "ward_zone": meta["ward_zone"],
            "distance_km": res["distance_km"],
            "duration_min": res["duration_min"],
            "source": res["source"],
            "api_key_active": res["api_key_active"],
            "coordinates": res["coordinates"]
        }
    return {
        "provider": "OpenRouteService" if routing_service.api_key else "OSRM (OpenStreetMap Engine Fallback)",
        "api_key_active": bool(routing_service.api_key),
        "corridors": results
    }

# Serve static frontend files
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")

if os.path.exists(FRONTEND_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")

    @app.get("/")
    def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
