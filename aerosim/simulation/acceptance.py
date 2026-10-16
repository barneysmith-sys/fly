"""Numeric checks applied to a finished trace.

The limits below are the milestone's acceptance band. They are not physical
constants. A run that misses them is reported as a failed check; the trace
itself is still returned.
"""

from __future__ import annotations

from typing import Any

from aerosim.physics.parameters import SimulationConfig
from aerosim.simulation.state import Sample

# Several time constants past the 1.5 rad/s design point. 1/omega_n is 2/3 s,
# so 8 s is 12 design time constants of the PD loop.
SETTLE_TIME_S = 8.0
ALTITUDE_TOLERANCE_M = 0.02
VELOCITY_TOLERANCE_M_S = 0.05


def evaluate_trace(samples: list[Sample], config: SimulationConfig) -> dict[str, Any]:
    """Score a trace against the hover acceptance band."""

    if not samples:
        raise ValueError("cannot evaluate an empty trace")

    criteria: list[dict[str, Any]] = []
    max_thrust = max(sample.thrust_n for sample in samples)
    min_thrust = min(sample.thrust_n for sample in samples)
    criteria.append(
        _criterion(
            name="thrust_upper_bound",
            description="Applied thrust never exceeds T_max.",
            observed=max_thrust,
            limit=config.thrust_max_n,
            unit="N",
            passed=max_thrust <= config.thrust_max_n + 1e-12,
        )
    )
    criteria.append(
        _criterion(
            name="thrust_lower_bound",
            description="Applied thrust is never below T_min.",
            observed=min_thrust,
            limit=config.thrust_min_n,
            unit="N",
            passed=min_thrust >= config.thrust_min_n - 1e-12,
        )
    )

    if config.ground_contact:
        minimum_altitude = min(sample.altitude_m for sample in samples)
        criteria.append(
            _criterion(
                name="ground_constraint",
                description="Altitude stays at or above the ground plane.",
                observed=minimum_altitude,
                limit=0.0,
                unit="m",
                passed=minimum_altitude >= -1e-12,
            )
        )

    final = samples[-1]
    criteria.append(
        _criterion(
            name="final_altitude",
            description="Final altitude is within 0.02 m of the target.",
            observed=abs(final.altitude_m - config.target_altitude_m),
            limit=ALTITUDE_TOLERANCE_M,
            unit="m",
            passed=abs(final.altitude_m - config.target_altitude_m) <= ALTITUDE_TOLERANCE_M,
        )
    )
    criteria.append(
        _criterion(
            name="final_vertical_velocity",
            description="Final vertical velocity is within 0.05 m/s of zero.",
            observed=abs(final.vertical_velocity_m_s),
            limit=VELOCITY_TOLERANCE_M_S,
            unit="m/s",
            passed=abs(final.vertical_velocity_m_s) <= VELOCITY_TOLERANCE_M_S,
        )
    )

    if config.duration_s + 1e-12 >= SETTLE_TIME_S:
        settled = [sample for sample in samples if sample.time_s + 1e-12 >= SETTLE_TIME_S]
        altitude_excursion = max(
            abs(sample.altitude_m - config.target_altitude_m) for sample in settled
        )
        velocity_excursion = max(abs(sample.vertical_velocity_m_s) for sample in settled)
        criteria.append(
            _criterion(
                name="settled_altitude",
                description="From t = 8 s onward, altitude stays within 0.02 m of the target.",
                observed=altitude_excursion,
                limit=ALTITUDE_TOLERANCE_M,
                unit="m",
                passed=altitude_excursion <= ALTITUDE_TOLERANCE_M,
            )
        )
        criteria.append(
            _criterion(
                name="settled_vertical_velocity",
                description="From t = 8 s onward, vertical speed stays within 0.05 m/s.",
                observed=velocity_excursion,
                limit=VELOCITY_TOLERANCE_M_S,
                unit="m/s",
                passed=velocity_excursion <= VELOCITY_TOLERANCE_M_S,
            )
        )

    return {
        "passed": all(item["passed"] for item in criteria),
        "settle_time_s": SETTLE_TIME_S,
        "altitude_tolerance_m": ALTITUDE_TOLERANCE_M,
        "velocity_tolerance_m_s": VELOCITY_TOLERANCE_M_S,
        "criteria": criteria,
    }


def _criterion(
    *,
    name: str,
    description: str,
    observed: float,
    limit: float,
    unit: str,
    passed: bool,
) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "observed": observed,
        "limit": limit,
        "unit": unit,
        "passed": passed,
    }
