"""
Fleet & Telemetry Simulator for HazardZ Platform.
Simulates public buses moving along Hyderabad transit corridors:
- Route 47L (Afzal Gunj - Koti - Kacheguda)
- Route 9M (Mehdipatnam - Nampally - Charminar)
- Route 8R (Secunderabad - Musheerabad - Puranapul)
- Route 127 (Lakdikapul - Secretariat - Tank Bund)
- Route 216 (Dilsukhnagar - Malakpet - Koti)

Generates:
- Live GPS waypoints, speed (km/h), and heading
- Dynamic hazard triggers along the route
- Store-and-forward edge buffer emulation
"""

import time
import math
import random
import json
from typing import Dict, List, Any, Optional
from .database import update_bus_telemetry, insert_hazard, get_all_buses
from .ai_detector import detector
from .routing_service import routing_service

# Realistic route waypoints in Hyderabad
BUS_ROUTES = {
    "TS-09-UB-4012": {
        "route_number": "Route 47L",
        "driver_name": "Rajesh Kumar",
        "road_name": "Afzal Gunj - Koti Road Corridor",
        "ward_zone": "Charminar Zone",
        "waypoints": [
            (17.3750, 78.4740),
            (17.3820, 78.4810),
            (17.3912, 78.4905),
            (17.3980, 78.4980),
            (17.4045, 78.5020),
            (17.3980, 78.4980),
            (17.3912, 78.4905),
            (17.3820, 78.4810)
        ]
    },
    "TS-09-UB-3108": {
        "route_number": "Route 9M",
        "driver_name": "Syed Mansoor",
        "road_name": "Nampally - Moazzam Jahi - Charminar Arterial",
        "ward_zone": "Goshamahal Zone",
        "waypoints": [
            (17.3980, 78.4680),
            (17.3900, 78.4710),
            (17.3820, 78.4715),
            (17.3680, 78.4735),
            (17.3616, 78.4747),
            (17.3680, 78.4735),
            (17.3820, 78.4715),
            (17.3900, 78.4710)
        ]
    },
    "TS-09-UB-1042": {
        "route_number": "Route 8R",
        "driver_name": "M. Venkatesh",
        "road_name": "Musheerabad - Puranapul South Corridor",
        "ward_zone": "South Zone",
        "waypoints": [
            (17.4200, 78.5000),
            (17.4050, 78.4950),
            (17.3880, 78.4890),
            (17.3735, 78.4812),
            (17.3600, 78.4650),
            (17.3735, 78.4812),
            (17.3880, 78.4890),
            (17.4050, 78.4950)
        ]
    },
    "TS-09-UB-5221": {
        "route_number": "Route 127",
        "driver_name": "Sunil Rao",
        "road_name": "Lakdikapul - Secretariat - Tank Bund Express",
        "ward_zone": "Khairatabad Zone",
        "waypoints": [
            (17.4060, 78.4620),
            (17.4120, 78.4680),
            (17.4180, 78.4740),
            (17.4250, 78.4790),
            (17.4320, 78.4850),
            (17.4250, 78.4790),
            (17.4180, 78.4740),
            (17.4120, 78.4680)
        ]
    }
}

class FleetSimulator:
    def __init__(self):
        # Track position progress indices for each bus
        self.bus_progress = {bus_id: float(i * 1.5) for i, bus_id in enumerate(BUS_ROUTES.keys())}
        self.offline_buffers: Dict[str, List[Dict[str, Any]]] = {}
        self.store_and_forward_enabled: Dict[str, bool] = {bus_id: False for bus_id in BUS_ROUTES.keys()}
        self.weather_mode = "CLEAR" # CLEAR, RAIN, NIGHT

    def set_store_and_forward(self, bus_id: str, enabled: bool):
        self.store_and_forward_enabled[bus_id] = enabled
        if not enabled and bus_id in self.offline_buffers and self.offline_buffers[bus_id]:
            # Flush buffered events to central database
            buffered = self.offline_buffers.pop(bus_id, [])
            for evt in buffered:
                insert_hazard(evt)
            return len(buffered)
        return 0

    def set_weather_mode(self, mode: str):
        self.weather_mode = mode

    def step_simulation(self) -> Dict[str, Any]:
        """
        Advances all buses along their route waypoints, computes heading,
        and optionally triggers edge hazard detections.
        """
        updated_buses = []
        newly_detected_hazards = []

        for bus_id, meta in BUS_ROUTES.items():
            waypoints = meta["waypoints"]
            curr_prog = self.bus_progress[bus_id]
            
            # Step forward along route
            step_size = 0.04 + random.uniform(-0.005, 0.008)
            curr_prog = (curr_prog + step_size) % len(waypoints)
            self.bus_progress[bus_id] = curr_prog

            # Interpolate between current waypoint and next
            idx_start = int(curr_prog)
            idx_next = (idx_start + 1) % len(waypoints)
            fraction = curr_prog - idx_start

            lat1, lon1 = waypoints[idx_start]
            lat2, lon2 = waypoints[idx_next]

            curr_lat = round(lat1 + (lat2 - lat1) * fraction, 5)
            curr_lon = round(lon1 + (lon2 - lon1) * fraction, 5)

            # Calculate heading (bearing)
            d_lon = lon2 - lon1
            d_lat = lat2 - lat1
            angle = math.atan2(d_lon, d_lat)
            heading = round((math.degrees(angle) + 360) % 360, 1)

            speed = round(random.uniform(26.0, 42.0), 1)

            # Update in DB
            update_bus_telemetry(bus_id, curr_lat, curr_lon, speed, heading)

            bus_state = {
                "bus_id": bus_id,
                "route_number": meta["route_number"],
                "driver_name": meta["driver_name"],
                "latitude": curr_lat,
                "longitude": curr_lon,
                "speed_kmh": speed,
                "heading": heading,
                "road_name": meta["road_name"],
                "ward_zone": meta["ward_zone"],
                "is_offline_buffer": self.store_and_forward_enabled.get(bus_id, False),
                "buffered_events_count": len(self.offline_buffers.get(bus_id, []))
            }
            updated_buses.append(bus_state)

        return {
            "buses": updated_buses,
            "new_hazards": newly_detected_hazards,
            "weather_mode": self.weather_mode
        }

    def trigger_edge_detection(self, bus_id: str, custom_hazard: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Simulates an on-demand or periodic edge AI inference event from a bus camera.
        """
        if bus_id not in BUS_ROUTES:
            bus_id = list(BUS_ROUTES.keys())[0]

        meta = BUS_ROUTES[bus_id]
        waypoints = meta["waypoints"]
        curr_prog = self.bus_progress[bus_id]
        idx_start = int(curr_prog)
        lat, lon = waypoints[idx_start]

        # Slight GPS jitter for realism
        lat += random.uniform(-0.0003, 0.0003)
        lon += random.uniform(-0.0003, 0.0003)

        if custom_hazard:
            hazard_type = custom_hazard.get("hazard_type", "Pothole")
            severity = custom_hazard.get("severity", "HIGH")
            severity_score = custom_hazard.get("severity_score", 8.2)
            confidence = custom_hazard.get("confidence", 0.93)
            bbox = custom_hazard.get("bbox", [180, 220, 160, 100])
        else:
            detection_res = detector.detect_frame(weather_mode=self.weather_mode)
            if detection_res["detections"]:
                det = detection_res["detections"][0]
                hazard_type = det["hazard_type"]
                severity = det["severity"]
                severity_score = det["severity_score"]
                confidence = det["confidence"]
                bbox = det["bbox"]
            else:
                hazard_type = "Pothole"
                severity = "HIGH"
                severity_score = 7.9
                confidence = 0.91
                bbox = [175, 230, 150, 90]

        now = time.time()
        hazard_id = f"HAZ-HYD-{random.randint(200, 999)}"

        hazard_record = {
            "id": hazard_id,
            "hazard_type": hazard_type,
            "severity": severity,
            "severity_score": severity_score,
            "latitude": round(lat, 5),
            "longitude": round(lon, 5),
            "road_name": meta["road_name"],
            "ward_zone": meta["ward_zone"],
            "bus_id": f"{bus_id} ({meta['route_number']})",
            "confidence": confidence,
            "timestamp": now,
            "status": "NEW",
            "assigned_contractor": None,
            "estimated_repair_hours": 6 if severity == "CRITICAL" else 12,
            "bbox_data": json.dumps(bbox),
            "image_url": f"/assets/{hazard_type.lower().split()[0]}_sample.jpg",
            "notes": f"Detected by AI edge model on {meta['route_number']}. Confidence: {int(confidence * 100)}%."
        }

        # Check if store-and-forward is active for this bus
        if self.store_and_forward_enabled.get(bus_id, False):
            if bus_id not in self.offline_buffers:
                self.offline_buffers[bus_id] = []
            self.offline_buffers[bus_id].append(hazard_record)
            return {
                "hazard": hazard_record,
                "status": "BUFFERED_OFFLINE",
                "message": f"Edge connectivity offline. Event buffered locally on {bus_id}. ({len(self.offline_buffers[bus_id])} queued)"
            }
        else:
            insert_hazard(hazard_record)
            return {
                "hazard": hazard_record,
                "status": "INGESTED_CENTRAL",
                "message": f"Event instantly streamed to Municipal Central via 5G/4G."
            }

fleet_sim = FleetSimulator()
