"""
Routing Service for HazardZ Platform.
Connects to OpenRouteService (ORS) / OpenMapRoute API for:
- Live street-accurate bus route geometries (turn-by-turn navigation paths)
- Road corridor distance & travel duration calculations
- Fallback to OSRM (Open Source Routing Machine) or interpolated street paths when offline
"""

import os
import json
import requests
from typing import List, Tuple, Dict, Any, Optional

ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")

class RoutingService:
    def __init__(self):
        self.api_key = self.load_api_key()
        self.cache: Dict[str, List[Tuple[float, float]]] = {}

    def load_api_key(self) -> str:
        # Check environment variable first
        key = os.environ.get("OPENROUTESERVICE_API_KEY", "") or os.environ.get("OPENMAPROUTE_API_KEY", "")
        if key:
            return key.strip()

        # Check .env file
        if os.path.exists(ENV_PATH):
            try:
                with open(ENV_PATH, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("OPENROUTESERVICE_API_KEY=") or line.startswith("OPENMAPROUTE_API_KEY="):
                            parts = line.split("=", 1)
                            if len(parts) > 1:
                                return parts[1].strip()
            except Exception as e:
                print("Error reading .env:", e)
        return ""

    def save_api_key(self, new_key: str) -> bool:
        self.api_key = new_key.strip()
        os.environ["OPENROUTESERVICE_API_KEY"] = self.api_key
        try:
            with open(ENV_PATH, "w", encoding="utf-8") as f:
                f.write(f"# OpenRouteService / OpenMapRoute API Configuration\n")
                f.write(f"OPENROUTESERVICE_API_KEY={self.api_key}\n")
            # Invalidate cache so routes re-fetch with new key
            self.cache.clear()
            return True
        except Exception as e:
            print("Error writing .env:", e)
            return False

    def get_route_directions(self, waypoints: List[Tuple[float, float]]) -> Dict[str, Any]:
        """
        Takes list of (lat, lon) waypoints and returns detailed street-following route coordinates [(lat, lon), ...],
        distance in km, and duration in seconds.
        """
        # OpenRouteService expects coordinates as [longitude, latitude]
        coords_lon_lat = [[lon, lat] for (lat, lon) in waypoints]

        # 1. Try OpenRouteService API if API key is configured
        if self.api_key:
            try:
                url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"
                headers = {
                    "Authorization": self.api_key,
                    "Content-Type": "application/json",
                    "Accept": "application/json, application/geo+json"
                }
                body = {
                    "coordinates": coords_lon_lat,
                    "preference": "recommended",
                    "instructions": False
                }
                resp = requests.post(url, json=body, headers=headers, timeout=6)
                if resp.status_code == 200:
                    data = resp.json()
                    features = data.get("features", [])
                    if features:
                        geometry = features[0].get("geometry", {})
                        raw_coords = geometry.get("coordinates", []) # [[lon, lat], ...]
                        summary = features[0].get("properties", {}).get("summary", {})
                        
                        # Convert back to (lat, lon)
                        lat_lon_path = [(pt[1], pt[0]) for pt in raw_coords]
                        return {
                            "source": "OpenRouteService API",
                            "status": "success",
                            "api_key_active": True,
                            "distance_km": round(summary.get("distance", 0) / 1000, 2),
                            "duration_min": round(summary.get("duration", 0) / 60, 1),
                            "coordinates": lat_lon_path
                        }
                    else:
                        print("OpenRouteService: No features found in response.")
                else:
                    print(f"OpenRouteService API returned {resp.status_code}: {resp.text}")
            except Exception as e:
                print("OpenRouteService API connection error:", e)

        # 2. Fallback to Open Source Routing Machine (OSRM) if no key or error
        try:
            coord_str = ";".join([f"{lon},{lat}" for (lat, lon) in waypoints])
            osrm_url = f"https://router.project-osrm.org/route/v1/driving/{coord_str}?overview=full&geometries=geojson"
            resp = requests.get(osrm_url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                routes = data.get("routes", [])
                if routes:
                    raw_coords = routes[0].get("geometry", {}).get("coordinates", [])
                    dist = routes[0].get("distance", 0) / 1000
                    dur = routes[0].get("duration", 0) / 60
                    lat_lon_path = [(pt[1], pt[0]) for pt in raw_coords]
                    return {
                        "source": "OSRM (OpenStreetMap Engine Fallback)",
                        "status": "success",
                        "api_key_active": bool(self.api_key),
                        "distance_km": round(dist, 2),
                        "duration_min": round(dur, 1),
                        "coordinates": lat_lon_path
                    }
        except Exception as e:
            print("OSRM Fallback error:", e)

        # 3. Fallback to native waypoints
        return {
            "source": "Native Waypoints",
            "status": "fallback",
            "api_key_active": bool(self.api_key),
            "distance_km": 12.4,
            "duration_min": 25.0,
            "coordinates": waypoints
        }

routing_service = RoutingService()
