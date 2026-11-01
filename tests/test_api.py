"""
End-to-End API Contract Verification Test Suite
Verifies every field and type against the Delhi Urban Flood Nowcasting API contract.
Zero external dependencies (uses standard library urllib and json).
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("TEST_BASE_URL", "http://127.0.0.1:8000")

passed_tests = 0
failed_tests = 0


def assert_condition(condition, msg):
    global passed_tests, failed_tests
    if condition:
        passed_tests += 1
        print(f"  [PASS] {msg}")
    else:
        failed_tests += 1
        print(f"  [FAIL] FAILED: {msg}")


def get_json(path):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as res:
        return json.loads(res.read().decode("utf-8"))


def post_json(path, body):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=10) as res:
        return json.loads(res.read().decode("utf-8"))


def test_hotspots():
    print("\n[TEST 1] GET /api/gis/hotspots")
    data = get_json("/api/gis/hotspots")
    assert_condition("hotspots" in data and isinstance(data["hotspots"], list), "Response contains hotspots list")
    assert_condition(len(data["hotspots"]) > 0, "At least one hotspot returned")
    
    first = data["hotspots"][0]
    assert_condition(isinstance(first.get("id"), str), "Field 'id' is str")
    assert_condition(isinstance(first.get("name"), str), "Field 'name' is str")
    assert_condition(isinstance(first.get("lat"), (int, float)), "Field 'lat' is float")
    assert_condition(isinstance(first.get("lng"), (int, float)), "Field 'lng' is float")
    assert_condition(isinstance(first.get("risk_level"), str), "Field 'risk_level' is str")
    assert_condition(isinstance(first.get("description"), str), "Field 'description' is str")


def test_drains():
    print("\n[TEST 2] GET /api/gis/drains")
    data = get_json("/api/gis/drains")
    assert_condition("drains" in data and isinstance(data["drains"], list), "Response contains drains list")
    assert_condition(len(data["drains"]) > 0, "At least one drain returned")
    
    first = data["drains"][0]
    for field in ["id", "name", "basin", "type", "topology", "receiving_outlet", "ground_elevation"]:
        assert_condition(isinstance(first.get(field), str), f"Field '{field}' is str")
    for num_field in ["design_capacity_m3s", "design_capacity_cusecs", "base_inflow_m3s"]:
        assert_condition(isinstance(first.get(num_field), (int, float)), f"Field '{num_field}' is numeric")
    
    coords = first.get("coordinates")
    assert_condition(isinstance(coords, list) and len(coords) > 0, "Field 'coordinates' is non-empty list")
    assert_condition(len(coords[0]) == 2 and isinstance(coords[0][0], (int, float)), "Coordinates are [lat, lng] pairs")


def test_nodes():
    print("\n[TEST 3] GET /api/gis/nodes")
    data = get_json("/api/gis/nodes")
    assert_condition("nodes" in data and isinstance(data["nodes"], list), "Response contains nodes list")
    first = data["nodes"][0]
    assert_condition(isinstance(first.get("name"), str), "Field 'name' is str")
    assert_condition(isinstance(first.get("type"), str), "Field 'type' is str")
    assert_condition(isinstance(first.get("lat"), (int, float)), "Field 'lat' is numeric")
    assert_condition(isinstance(first.get("lng"), (int, float)), "Field 'lng' is numeric")
    assert_condition(isinstance(first.get("elevation"), (int, float)), "Field 'elevation' is numeric")
    assert_condition(isinstance(first.get("radius"), (int, float)), "Field 'radius' is numeric")
    assert_condition(isinstance(first.get("color"), str), "Field 'color' is str")


def test_contours():
    print("\n[TEST 4] GET /api/gis/contours")
    data = get_json("/api/gis/contours")
    assert_condition("contours" in data and isinstance(data["contours"], list), "Response contains contours list")
    first = data["contours"][0]
    assert_condition(isinstance(first.get("elevation"), (int, float)), "Field 'elevation' is numeric")
    assert_condition(isinstance(first.get("label"), str), "Field 'label' is str")
    assert_condition(isinstance(first.get("color"), str), "Field 'color' is str")
    assert_condition(isinstance(first.get("coordinates"), list), "Field 'coordinates' is list")


def test_danger_zones():
    print("\n[TEST 5] GET /api/gis/danger-zones?scenario=50")
    data = get_json("/api/gis/danger-zones?scenario=50")
    assert_condition("danger_zones" in data and isinstance(data["danger_zones"], list), "Response contains danger_zones list")
    first = data["danger_zones"][0]
    for field in ["name", "altitude_range", "risk_level", "risk_color", "fill_color"]:
        assert_condition(isinstance(first.get(field), str), f"Field '{field}' is str")
    assert_condition(isinstance(first.get("simulated_depth_m"), (int, float)), "Field 'simulated_depth_m' is numeric")
    assert_condition(isinstance(first.get("coordinates"), list), "Field 'coordinates' is list")
    
    # Safe zone risk_level requirement
    safe_zones = [z for z in data["danger_zones"] if "SAFE" in z["risk_level"]]
    assert_condition(len(safe_zones) >= 1, "At least one safe zone with 'SAFE' in risk_level")


def test_hydro_inspect():
    print("\n[TEST 6] GET /api/hydro/inspect?lat=28.6328&lng=77.2197&scenario=10")
    data = get_json("/api/hydro/inspect?lat=28.6328&lng=77.2197&scenario=10")
    for num_field in ["elevation_dem_m", "water_depth_m", "ground_slope_deg", "surface_runoff_mm"]:
        assert_condition(isinstance(data.get(num_field), (int, float)), f"Field '{num_field}' is numeric")
    assert_condition(isinstance(data.get("d8_flow_dir"), str), "Field 'd8_flow_dir' is str")
    assert_condition(data.get("drainage_status") in ["SURCHARGED", "NORMAL"], "Field 'drainage_status' is SURCHARGED or NORMAL")


def test_radar():
    print("\n[TEST 7] GET /api/radar/realtime")
    data = get_json("/api/radar/realtime")
    assert_condition(isinstance(data.get("last_update"), str), "Field 'last_update' is str")
    assert_condition(isinstance(data.get("status"), str), "Field 'status' is str")
    assert_condition(isinstance(data.get("stale"), bool), "Field 'stale' is boolean")


def test_simulation_current():
    print("\n[TEST 8] GET /api/simulation/current?scenario=50&horizon=60")
    data = get_json("/api/simulation/current?scenario=50&horizon=60")
    assert_condition(isinstance(data.get("rainfall_scenario_mm"), int), "Field 'rainfall_scenario_mm' is int")
    assert_condition(isinstance(data.get("max_depth_m"), (int, float)), "Field 'max_depth_m' is numeric")
    assert_condition(isinstance(data.get("flooded_area_km2"), (int, float)), "Field 'flooded_area_km2' is numeric")
    assert_condition(isinstance(data.get("surcharged_nodes"), str), "Field 'surcharged_nodes' is str")
    assert_condition(isinstance(data.get("overloaded_drains"), str), "Field 'overloaded_drains' is str")
    assert_condition(isinstance(data.get("active_warnings"), list), "Field 'active_warnings' is list")


def test_routes():
    print("\n[TEST 9] POST /api/routes/flood-safe")
    payload = {
        "origin": "Connaught Place Inner Circle",
        "destination": "ISBT Kashmere Gate Transit Hub",
        "vehicle_type": "Ambulance",
        "forecast_horizon": "60 min",
        "rainfall_scenario": 50
    }
    data = post_json("/api/routes/flood-safe", payload)
    assert_condition("routes" in data and isinstance(data["routes"], list), "Response contains routes list")
    routes = data["routes"]
    assert_condition(len(routes) == 3, "Exactly 3 candidate routes returned")
    
    assert_condition("SAFEST" in routes[0].get("badge", ""), "Route 1 badge contains 'SAFEST'")
    assert_condition("BALANCED" in routes[1].get("badge", ""), "Route 2 badge contains 'BALANCED'")
    assert_condition("CORRIDOR" in routes[2].get("badge", ""), "Route 3 badge contains 'CORRIDOR'")
    
    for r in routes:
        assert_condition(r.get("risk_class") in ["low", "medium", "critical"], "Field 'risk_class' valid")
        assert_condition(isinstance(r.get("distance_km"), (int, float)), "Field 'distance_km' is numeric")
        assert_condition(isinstance(r.get("eta_min"), int), "Field 'eta_min' is int")
        assert_condition(isinstance(r.get("max_water_m"), (int, float)), "Field 'max_water_m' is numeric")
        assert_condition(isinstance(r.get("coordinates"), list), "Field 'coordinates' is list")


def test_additional_endpoints():
    print("\n[TEST 10] GET /api/weather/current")
    w = get_json("/api/weather/current")
    assert_condition("temp_c" in w and isinstance(w["temp_c"], (int, float)), "Weather temp_c returned")
    assert_condition("precip_mm" in w and isinstance(w["precip_mm"], (int, float)), "Weather precip_mm returned")

    print("\n[TEST 11] GET /api/weather/forecast")
    wf = get_json("/api/weather/forecast")
    assert_condition("forecast" in wf and isinstance(wf["forecast"], list), "Forecast list returned")

    print("\n[TEST 12] GET /api/satellite/latest")
    sat = get_json("/api/satellite/latest")
    assert_condition("satellite" in sat and isinstance(sat["satellite"], str), "Satellite name returned")
    assert_condition("thumbnail_url" in sat or "tile_url_template" in sat, "Satellite imagery links returned")

    print("\n[TEST 13] POST /api/reports")
    rep = post_json("/api/reports", {
        "lat": 28.6338,
        "lng": 77.2224,
        "water_depth_est_m": 0.75,
        "description": "Flooding reported at test location"
    })
    assert_condition(rep.get("success") is True, "Crowd report submitted successfully")

    print("\n[TEST 14] GET /api/reports")
    reps = get_json("/api/reports")
    assert_condition("reports" in reps and isinstance(reps["reports"], list), "Crowd reports list returned")

    print("\n[TEST 15] GET /api/health")
    h = get_json("/api/health")
    assert_condition("status" in h and h["status"] in ["HEALTHY", "DEGRADED"], "Health status returned")
    assert_condition("sources" in h and isinstance(h["sources"], list), "Source health list returned")

    print("\n[TEST 16] GET /api/dem/heightmap?size=16")
    hm = get_json("/api/dem/heightmap?size=16")
    assert_condition("grid" in hm and isinstance(hm["grid"], list), "Heightmap grid returned")
    assert_condition(len(hm["grid"]) == 16, "Heightmap grid row count matches size 16")

    print("\n[TEST 17] GET /api/infrastructure/assets")
    infra = get_json("/api/infrastructure/assets")
    assert_condition("pumps" in infra and len(infra["pumps"]) == 8, "8 mock pumps returned in assets")
    assert_condition("gates" in infra and len(infra["gates"]) == 4, "4 sluice gates returned in assets")
    assert_condition(all("status" in p for p in infra["pumps"]), "All pumps have status field (ON/OFF)")
    assert_condition(all("status" in g for g in infra["gates"]), "All gates have status field (OPEN/CLOSED)")

    print("\n[TEST 18] GET /api/infrastructure/optimize")
    opt = get_json("/api/infrastructure/optimize")
    assert_condition(opt.get("status") == "success", "Optimizer returned success status")
    assert_condition("before_after" in opt, "Optimizer contains before_after metrics")
    assert_condition(opt["before_after"]["flooded_area_km2"]["before"] == 2.4, "Before flooded area is 2.4 km2")
    assert_condition(opt["before_after"]["flooded_area_km2"]["after"] == 0.8, "After flooded area reduced to 0.8 km2")
    assert_condition("schedule" in opt and len(opt["schedule"]) == 8, "8 pump/gate dispatch schedules returned")

    print("\n[TEST 19] POST /api/infrastructure/apply-schedule")
    applied = post_json("/api/infrastructure/apply-schedule", {"schedule": opt["schedule"]})
    assert_condition(applied.get("applied") is True, "AI dispatch schedule applied successfully")
    assert_condition(applied.get("status") == "success", "Schedule execution status is success")

    print("\n[TEST 20] GET /api/weather/live (Open-Meteo Integration)")
    live = get_json("/api/weather/live")
    assert_condition(live.get("success") is True, "Live weather telemetry succeeded")
    assert_condition("current_weather" in live, "Live telemetry contains current_weather from Open-Meteo")
    assert_condition("temp_c" in live["current_weather"], "Live temperature returned")
    assert_condition("stations" in live and len(live["stations"]) >= 5, "Live weather station network returned")


def run_all():
    print(f"============================================================")
    print(f"DELHI FLOOD NOWCASTING API CONTRACT VERIFICATION")
    print(f"Testing against base URL: {BASE_URL}")
    print(f"============================================================")
    
    test_hotspots()
    test_drains()
    test_nodes()
    test_contours()
    test_danger_zones()
    test_hydro_inspect()
    test_radar()
    test_simulation_current()
    test_routes()
    test_additional_endpoints()
    
    print("\n============================================================")
    print(f"SUMMARY: {passed_tests} PASSED | {failed_tests} FAILED")
    print("============================================================")
    
    if failed_tests > 0:
        sys.exit(1)


if __name__ == "__main__":
    run_all()
