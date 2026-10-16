"""Local JSON API for the dashboard.

GET  /api/health
GET  /api/model
GET  /api/scenarios/hover-2m
POST /api/simulate

The hover endpoint runs the Python model and returns that trace. It does not
read a recorded flight or fill in missing samples.
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

from aerosim.physics.parameters import SimulationConfig, validate_config
from aerosim.simulation.runner import run_simulation, summarize
from aerosim.simulation.scenarios import hover_2m_config
from aerosim.spec import model_document

MAX_BODY_BYTES = 65_536

_CONFIG_FIELDS = (
    "mass_kg",
    "gravity_m_s2",
    "thrust_min_n",
    "thrust_max_n",
    "drag_coefficient_kg_per_m",
    "external_force_n",
    "initial_altitude_m",
    "initial_vertical_velocity_m_s",
    "target_altitude_m",
    "kp_n_per_m",
    "ki_n_per_m_s",
    "kd_n_s_per_m",
    "timestep_s",
    "duration_s",
    "ground_contact",
    "velocity_reference_m_s",
    "natural_frequency_rad_s",
    "damping_ratio",
)


def create_server(host: str, port: int) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), SimulationHandler)


def result_payload(result: Any, scenario_id: str | None) -> dict[str, Any]:
    return {
        "scenario_id": scenario_id,
        "config": result.config.to_dict(),
        "model": model_document(),
        "samples": [sample.to_dict() for sample in result.samples],
        "summary": summarize(result),
        "acceptance": result.acceptance,
    }


def config_from_json(payload: dict[str, Any]) -> SimulationConfig:
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")
    unknown = sorted(set(payload) - set(_CONFIG_FIELDS))
    if unknown:
        raise ValueError(f"unknown fields: {', '.join(unknown)}")
    missing = [field for field in _CONFIG_FIELDS if field not in payload]
    # Design metadata may be omitted. velocity_reference defaults to 0.
    optional = {"natural_frequency_rad_s", "damping_ratio", "velocity_reference_m_s"}
    missing = [field for field in missing if field not in optional]
    if missing:
        raise ValueError(f"missing fields: {', '.join(missing)}")
    values: dict[str, Any] = {}
    for field in _CONFIG_FIELDS:
        if field not in payload:
            continue
        value = payload[field]
        if field == "ground_contact":
            if not isinstance(value, bool):
                raise ValueError("ground_contact must be a boolean")
            values[field] = value
            continue
        if field in {"natural_frequency_rad_s", "damping_ratio"} and value is None:
            values[field] = None
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{field} must be a number")
        values[field] = float(value)
    config = SimulationConfig(**values)
    validate_config(config)
    return config


class SimulationHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/health":
            self._send(200, {"status": "ok", "service": "aerosim"})
            return
        if path == "/api/model":
            self._send(200, model_document())
            return
        if path == "/api/scenarios/hover-2m":
            result = run_simulation(hover_2m_config())
            self._send(200, result_payload(result, "hover_2m"))
            return
        self._send(404, {"error": f"no route {path}"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path != "/api/simulate":
            self._send(404, {"error": f"no route {path}"})
            return
        try:
            payload = self._read_json()
            config = config_from_json(payload)
        except ValueError as exc:
            self._send(400, {"error": str(exc)})
            return
        except json.JSONDecodeError:
            self._send(400, {"error": "request body is not valid JSON"})
            return
        result = run_simulation(config)
        self._send(200, result_payload(result, None))

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        print(f"aerosim {self.address_string()} {format % args}")

    def _read_json(self) -> dict[str, Any]:
        length_header = self.headers.get("Content-Length")
        if length_header is None:
            raise ValueError("Content-Length is required")
        try:
            length = int(length_header)
        except ValueError as exc:
            raise ValueError("Content-Length must be an integer") from exc
        if length < 0 or length > MAX_BODY_BYTES:
            raise ValueError("request body is empty or larger than 64 KiB")
        raw = self.rfile.read(length)
        parsed = json.loads(raw.decode("utf-8"))
        if not isinstance(parsed, dict):
            raise ValueError("request body must be a JSON object")
        return parsed

    def _send(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


def main() -> None:
    import os

    host = os.environ.get("AEROSIM_HOST", "127.0.0.1")
    port = int(os.environ.get("AEROSIM_PORT", "8000"))
    server = create_server(host, port)
    print(f"AEROSIM API at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("stopping")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
