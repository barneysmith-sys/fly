"""The HTTP API returns a trace computed by the model."""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request

from aerosim.api.server import create_server
from aerosim.simulation.scenarios import hover_2m_config
from aerosim.spec import EQUATIONS


def _server() -> tuple[threading.Thread, object]:
    server = create_server("127.0.0.1", 0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return thread, server


def test_hover_endpoint_runs_the_milestone() -> None:
    _thread, server = _server()
    try:
        host, port = server.server_address
        with urllib.request.urlopen(f"http://{host}:{port}/api/scenarios/hover-2m") as response:
            body = json.load(response)
    finally:
        server.shutdown()
        server.server_close()

    assert body["scenario_id"] == "hover_2m"
    assert body["acceptance"]["passed"] is True
    assert body["samples"][0]["time_s"] == 0.0
    assert body["samples"][0]["altitude_m"] == 0.0
    assert abs(body["summary"]["final_altitude_m"] - 2.0) <= 0.02
    assert body["model"]["equations"] == EQUATIONS
    assert body["model"]["unit_notes"][0]["quantity"] == "Altitude"
    assert body["model"]["unit_notes"][0]["unit"] == "m"
    assert body["model"]["conventions"]
    assert body["summary"]["sample_count"] == len(body["samples"])
    assert "vertical_acceleration_m_s2" in body["samples"][0]
    assert body["model"]["hold_acceleration_band_m_s2"] == 0.05
    assert body["model"]["standard_gravity_m_s2"] == 9.80665
    assert body["summary"]["initial_motion"] in {"climb", "hold", "descend"}


def test_simulate_rejects_a_non_positive_mass() -> None:
    _thread, server = _server()
    try:
        host, port = server.server_address
        payload = hover_2m_config().to_dict()
        payload["mass_kg"] = 0.0
        request = urllib.request.Request(
            f"http://{host}:{port}/api/simulate",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(request)
            raise AssertionError("expected a 400 response")
        except urllib.error.HTTPError as error:
            assert error.code == 400
            detail = json.load(error)
    finally:
        server.shutdown()
        server.server_close()
    assert "mass_kg" in detail["error"]


def test_experiment_endpoint_runs_hover_equilibrium() -> None:
    _thread, server = _server()
    try:
        host, port = server.server_address
        with urllib.request.urlopen(f"http://{host}:{port}/api/experiments") as listing:
            catalog = json.load(listing)
        with urllib.request.urlopen(f"http://{host}:{port}/api/experiments/hover-equilibrium") as response:
            body = json.load(response)
        try:
            urllib.request.urlopen(f"http://{host}:{port}/api/experiments/not-a-model")
            raise AssertionError("expected a 404 response")
        except urllib.error.HTTPError as error:
            assert error.code == 404
    finally:
        server.shutdown()
        server.server_close()

    ids = [item["experiment_id"] for item in catalog["experiments"]]
    assert "free-fall" in ids
    assert "hover-equilibrium" in ids
    assert body["scenario_id"] == "hover-equilibrium"
    assert body["experiment"]["passed"] is True
    assert body["config"]["control_mode"] == "open_loop"
    assert body["samples"][0]["vertical_acceleration_m_s2"] == 0.0
    assert body["summary"]["initial_motion"] == "hold"


def test_open_loop_post_returns_freefall_acceleration() -> None:
    _thread, server = _server()
    try:
        host, port = server.server_address
        payload = hover_2m_config().to_dict()
        payload["control_mode"] = "open_loop"
        payload["open_loop_thrust_n"] = 0.0
        payload["initial_altitude_m"] = 2.0
        payload["duration_s"] = 0.5
        request = urllib.request.Request(
            f"http://{host}:{port}/api/simulate",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request) as response:
            body = json.load(response)
    finally:
        server.shutdown()
        server.server_close()

    assert body["samples"][0]["vertical_acceleration_m_s2"] == -body["config"]["gravity_m_s2"]
    assert body["summary"]["initial_motion"] == "descend"
    assert body["samples"][0]["proportional_n"] == 0.0


def test_model_manual_contains_the_equation_strings() -> None:
    from pathlib import Path

    manual = Path("docs/MODEL.md").read_text(encoding="utf-8")
    for equation in EQUATIONS.values():
        assert equation in manual


def test_units_guide_matches_the_notes_served_by_the_api() -> None:
    from pathlib import Path

    from aerosim.spec import CONVENTIONS, UNIT_NOTES

    guide = Path("docs/UNITS.md").read_text(encoding="utf-8")
    for note in UNIT_NOTES:
        assert str(note["plain"]) in guide
        assert str(note["unit"]) in guide
    for paragraph in CONVENTIONS:
        assert paragraph in guide
