"""
One-Click Launcher for HazardZ Prototype
Smart India Hackathon 2026 • Team Chillchat
"""

import os
import sys
import webbrowser
import threading
import time

def open_browser():
    time.sleep(1.5)
    print("Opening HazardZ Municipal Command Center in browser...")
    webbrowser.open("http://127.0.0.1:8000")

if __name__ == "__main__":
    import uvicorn
    threading.Thread(target=open_browser, daemon=True).start()
    print("=" * 70)
    print("  HAZARDZ — AI-Powered Mobile Urban Intelligence Platform (SIH 2026)")
    print("  Turning Public Transport Fleets into Mobile Road-Intelligence Units")
    print("  Server starting at: http://127.0.0.1:8000")
    print("=" * 70)
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
