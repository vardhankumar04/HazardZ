"""
Database layer for HazardZ Platform.
Manages SQLite storage for:
- Road Hazards (potholes, cracks, waterlogging, debris)
- Fleet Buses & GPS Telemetry
- Road Corridors & Road Health Index
- Municipal Work Orders & Action Audit Trail
"""

import sqlite3
import json
import time
import os
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hazardz.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Hazards Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS hazards (
        id TEXT PRIMARY KEY,
        hazard_type TEXT NOT NULL,
        severity TEXT NOT NULL,  -- 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
        severity_score REAL NOT NULL, -- 0.0 to 10.0
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        road_name TEXT NOT NULL,
        ward_zone TEXT NOT NULL,
        bus_id TEXT NOT NULL,
        confidence REAL NOT NULL,
        timestamp REAL NOT NULL,
        status TEXT NOT NULL, -- 'NEW', 'VERIFIED', 'CREW_DISPATCHED', 'RESOLVED'
        assigned_contractor TEXT,
        estimated_repair_hours INTEGER,
        bbox_data TEXT, -- JSON string: [x, y, w, h]
        image_url TEXT,
        notes TEXT
    )
    """)

    # Buses Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS fleet_buses (
        bus_id TEXT PRIMARY KEY,
        route_number TEXT NOT NULL,
        driver_name TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        speed_kmh REAL NOT NULL,
        heading REAL NOT NULL,
        status TEXT NOT NULL, -- 'ACTIVE', 'OFFLINE', 'STORE_AND_FORWARD'
        hazards_detected_today INTEGER DEFAULT 0,
        distance_covered_km REAL DEFAULT 0.0,
        last_ping REAL NOT NULL
    )
    """)

    # Municipal Activity Audit Log
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hazard_id TEXT,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        details TEXT,
        timestamp REAL NOT NULL
    )
    """)

    conn.commit()

    # Seed initial realistic data if hazards table is empty (Hyderabad transit corridors matching SIH deck)
    cursor.execute("SELECT COUNT(*) FROM hazards")
    count = cursor.fetchone()[0]
    if count == 0:
        seed_initial_data(conn)

    conn.close()

def seed_initial_data(conn):
    cursor = conn.cursor()
    now = time.time()

    # Initial Hyderabad Seed Hazards (matches slide 5: Pothole 17.39, 78.49; Waterlogging 17.38, 78.47; Crack 17.40, 78.50; Obstacle 17.37, 78.48)
    initial_hazards = [
        {
            "id": "HAZ-HYD-101",
            "hazard_type": "Pothole",
            "severity": "CRITICAL",
            "severity_score": 9.2,
            "latitude": 17.3912,
            "longitude": 78.4905,
            "road_name": "Afzal Gunj - Koti Road Corridor",
            "ward_zone": "Charminar Zone",
            "bus_id": "TS-09-UB-4012 (Route 47L)",
            "confidence": 0.94,
            "timestamp": now - 1800,
            "status": "NEW",
            "assigned_contractor": None,
            "estimated_repair_hours": 6,
            "bbox_data": json.dumps([160, 240, 180, 110]),
            "image_url": "/assets/pothole_sample.jpg",
            "notes": "Deep cratering on right lane, causing vehicles to swerve abruptly."
        },
        {
            "id": "HAZ-HYD-102",
            "hazard_type": "Waterlogging",
            "severity": "HIGH",
            "severity_score": 7.8,
            "latitude": 17.3820,
            "longitude": 78.4715,
            "road_name": "Moazzam Jahi Market Underpass",
            "ward_zone": "Goshamahal Zone",
            "bus_id": "TS-09-UB-3108 (Route 9M)",
            "confidence": 0.89,
            "timestamp": now - 3600,
            "status": "VERIFIED",
            "assigned_contractor": "GHMC Drainage Rapid Team",
            "estimated_repair_hours": 4,
            "bbox_data": json.dumps([80, 310, 340, 130]),
            "image_url": "/assets/waterlogging_sample.jpg",
            "notes": "12cm stagnant pool after rain, reducing dual carriage to single lane."
        },
        {
            "id": "HAZ-HYD-103",
            "hazard_type": "Road Crack",
            "severity": "LOW",
            "severity_score": 3.4,
            "latitude": 17.4045,
            "longitude": 78.5020,
            "road_name": "Kacheguda Station Approach",
            "ward_zone": "Secunderabad Zone",
            "bus_id": "TS-09-UB-4012 (Route 47L)",
            "confidence": 0.82,
            "timestamp": now - 7200,
            "status": "NEW",
            "assigned_contractor": None,
            "estimated_repair_hours": 24,
            "bbox_data": json.dumps([220, 280, 120, 90]),
            "image_url": "/assets/crack_sample.jpg",
            "notes": "Transverse thermal crack, non-immediate hazard but needs seal-coat."
        },
        {
            "id": "HAZ-HYD-104",
            "hazard_type": "Obstacle / Debris",
            "severity": "CRITICAL",
            "severity_score": 9.6,
            "latitude": 17.3735,
            "longitude": 78.4812,
            "road_name": "Puranapul Bridge Link Road",
            "ward_zone": "South Zone",
            "bus_id": "TS-09-UB-1042 (Route 8R)",
            "confidence": 0.96,
            "timestamp": now - 900,
            "status": "CREW_DISPATCHED",
            "assigned_contractor": "PWD Rapid Response Unit 4",
            "estimated_repair_hours": 2,
            "bbox_data": json.dumps([270, 260, 140, 100]),
            "image_url": "/assets/debris_sample.jpg",
            "notes": "Fallen construction concrete blocks obstructing middle lane."
        },
        {
            "id": "HAZ-HYD-105",
            "hazard_type": "Pothole",
            "severity": "MEDIUM",
            "severity_score": 5.7,
            "latitude": 17.4120,
            "longitude": 78.4680,
            "road_name": "Lakdikapul Flyover Exit",
            "ward_zone": "Khairatabad Zone",
            "bus_id": "TS-09-UB-5221 (Route 127)",
            "confidence": 0.87,
            "timestamp": now - 14400,
            "status": "RESOLVED",
            "assigned_contractor": "Apex Bitumen Works",
            "estimated_repair_hours": 8,
            "bbox_data": json.dumps([190, 290, 150, 95]),
            "image_url": "/assets/pothole_sample.jpg",
            "notes": "Repaired and cold-patched by Municipal Road Division on morning shift."
        }
    ]

    for h in initial_hazards:
        cursor.execute("""
        INSERT INTO hazards (
            id, hazard_type, severity, severity_score, latitude, longitude,
            road_name, ward_zone, bus_id, confidence, timestamp, status,
            assigned_contractor, estimated_repair_hours, bbox_data, image_url, notes
        ) VALUES (
            :id, :hazard_type, :severity, :severity_score, :latitude, :longitude,
            :road_name, :ward_zone, :bus_id, :confidence, :timestamp, :status,
            :assigned_contractor, :estimated_repair_hours, :bbox_data, :image_url, :notes
        )
        """, h)

    # Initial Fleet Buses
    initial_buses = [
        ("TS-09-UB-4012", "Route 47L", "Rajesh Kumar", 17.3915, 78.4900, 34.5, 45.0, "ACTIVE", 4, 42.8, now),
        ("TS-09-UB-3108", "Route 9M", "Syed Mansoor", 17.3825, 78.4720, 28.0, 130.0, "ACTIVE", 3, 36.4, now),
        ("TS-09-UB-1042", "Route 8R", "M. Venkatesh", 17.3740, 78.4815, 18.5, 270.0, "ACTIVE", 5, 51.2, now),
        ("TS-09-UB-5221", "Route 127", "Sunil Rao", 17.4125, 78.4685, 38.0, 90.0, "ACTIVE", 2, 29.7, now),
        ("TS-09-UB-6604", "Route 216", "Anand Verma", 17.4250, 78.4480, 0.0, 0.0, "STORE_AND_FORWARD", 1, 18.2, now)
    ]

    cursor.executemany("""
    INSERT INTO fleet_buses (
        bus_id, route_number, driver_name, latitude, longitude,
        speed_kmh, heading, status, hazards_detected_today, distance_covered_km, last_ping
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, initial_buses)

    # Initial Audit Log
    cursor.execute("""
    INSERT INTO audit_logs (hazard_id, action, actor, details, timestamp)
    VALUES ('HAZ-HYD-104', 'DISPATCH', 'Control Officer (SIH-GHMC)', 'Dispatched PWD Rapid Response Unit 4. Estimated completion: 2 hours.', ?)
    """, (now - 850,))

    conn.commit()

# Query helpers
def get_all_hazards(severity: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM hazards WHERE 1=1"
    params = []

    if severity and severity != "ALL":
        query += " AND severity = ?"
        params.append(severity)
    if status and status != "ALL":
        query += " AND status = ?"
        params.append(status)

    query += " ORDER BY severity_score DESC, timestamp DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_hazard_by_id(hazard_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM hazards WHERE id = ?", (hazard_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def insert_hazard(hazard: Dict[str, Any]) -> str:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO hazards (
        id, hazard_type, severity, severity_score, latitude, longitude,
        road_name, ward_zone, bus_id, confidence, timestamp, status,
        assigned_contractor, estimated_repair_hours, bbox_data, image_url, notes
    ) VALUES (
        :id, :hazard_type, :severity, :severity_score, :latitude, :longitude,
        :road_name, :ward_zone, :bus_id, :confidence, :timestamp, :status,
        :assigned_contractor, :estimated_repair_hours, :bbox_data, :image_url, :notes
    )
    """, hazard)

    # Log action
    cursor.execute("""
    INSERT INTO audit_logs (hazard_id, action, actor, details, timestamp)
    VALUES (?, 'DETECTED', ?, ?, ?)
    """, (
        hazard["id"],
        hazard["bus_id"],
        f"AI Edge unit on {hazard['bus_id']} detected {hazard['severity']} {hazard['hazard_type']} at {hazard['road_name']}.",
        hazard["timestamp"]
    ))

    # Update bus stats
    bus_short_id = hazard["bus_id"].split()[0]
    cursor.execute("""
    UPDATE fleet_buses 
    SET hazards_detected_today = hazards_detected_today + 1 
    WHERE bus_id = ?
    """, (bus_short_id,))

    conn.commit()
    conn.close()
    return hazard["id"]

def update_hazard_status(hazard_id: str, new_status: str, actor: str, contractor: Optional[str] = None, notes: Optional[str] = None) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    now = time.time()

    cursor.execute("""
    UPDATE hazards 
    SET status = ?, 
        assigned_contractor = COALESCE(?, assigned_contractor),
        notes = CASE WHEN ? IS NOT NULL THEN ? ELSE notes END
    WHERE id = ?
    """, (new_status, contractor, notes, notes, hazard_id))

    cursor.execute("""
    INSERT INTO audit_logs (hazard_id, action, actor, details, timestamp)
    VALUES (?, ?, ?, ?, ?)
    """, (
        hazard_id,
        new_status,
        actor,
        f"Status changed to {new_status}. Contractor: {contractor or 'N/A'}. Note: {notes or 'None'}",
        now
    ))

    conn.commit()
    conn.close()
    return True

def get_all_buses() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM fleet_buses")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_bus_telemetry(bus_id: str, lat: float, lon: float, speed: float, heading: float, distance_delta: float = 0.02):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE fleet_buses 
    SET latitude = ?, longitude = ?, speed_kmh = ?, heading = ?, 
        distance_covered_km = distance_covered_km + ?, last_ping = ?
    WHERE bus_id = ?
    """, (lat, lon, speed, heading, distance_delta, time.time(), bus_id))
    conn.commit()
    conn.close()

def get_analytics_summary() -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM hazards")
    total_hazards = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM hazards WHERE severity = 'CRITICAL' AND status != 'RESOLVED'")
    critical_unresolved = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM hazards WHERE status = 'RESOLVED'")
    resolved_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM fleet_buses WHERE status = 'ACTIVE'")
    active_buses = cursor.fetchone()[0]

    cursor.execute("SELECT SUM(distance_covered_km) FROM fleet_buses")
    total_km = round(cursor.fetchone()[0] or 0.0, 1)

    # Hazard by type
    cursor.execute("SELECT hazard_type, COUNT(*) as count FROM hazards GROUP BY hazard_type")
    type_counts = {row["hazard_type"]: row["count"] for row in cursor.fetchall()}

    # Hazard by severity
    cursor.execute("SELECT severity, COUNT(*) as count FROM hazards GROUP BY severity")
    severity_counts = {row["severity"]: row["count"] for row in cursor.fetchall()}

    # Recent Audit Logs
    cursor.execute("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 8")
    recent_logs = [dict(r) for r in cursor.fetchall()]

    conn.close()

    # Calculate City Road Health Index (0-100)
    penalty = (critical_unresolved * 8.5) + (severity_counts.get("HIGH", 0) * 3.5) + (severity_counts.get("MEDIUM", 0) * 1.5)
    road_health_index = max(15, min(100, int(100 - penalty)))

    return {
        "total_hazards": total_hazards,
        "critical_unresolved": critical_unresolved,
        "resolved_count": resolved_count,
        "active_buses": active_buses,
        "total_coverage_km": total_km,
        "road_health_index": road_health_index,
        "type_counts": type_counts,
        "severity_counts": severity_counts,
        "recent_logs": recent_logs
    }
