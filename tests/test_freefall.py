"""Open-loop free fall against the constant-acceleration solution."""

from __future__ import annotations

import math

from aerosim.physics.constants import STANDARD_GRAVITY_M_S2
from aerosim.physics.dynamics import step_vertical, vertical_acceleration_m_s2
from tests.analytical import constant_acceleration

MASS_KG = 1.2
Z0_M = 25.0
DT_S = 0.05
G = STANDARD_GRAVITY_M_S2


def _fall(steps: int, *, ground_contact: bool, drag: float = 0.0, thrust_n: float = 0.0) -> list[tuple[float, float, float]]:
    altitude = Z0_M
    velocity = 0.0
    trace = [(0.0, altitude, velocity)]
    for index in range(1, steps + 1):
        altitude, velocity, _thrust = step_vertical(
            altitude_m=altitude,
            vertical_velocity_m_s=velocity,
            thrust_command_n=thrust_n,
            timestep_s=DT_S,
            mass_kg=MASS_KG,
            gravity_m_s2=G,
            thrust_min_n=0.0,
            thrust_max_n=50.0,
            drag_coefficient_kg_per_m=drag,
            ground_contact=ground_contact,
        )
        trace.append((index * DT_S, altitude, velocity))
    return trace


def test_freefall_matches_analytic_solution_to_roundoff() -> None:
    steps = 40
    trace = _fall(steps, ground_contact=False)
    for time_s, altitude, velocity in trace:
        expected_z, expected_v = constant_acceleration(time_s, Z0_M, 0.0, -G)
        assert altitude == expected_z or abs(altitude - expected_z) < 1e-9
        assert velocity == expected_v or abs(velocity - expected_v) < 1e-9
        assert velocity <= 1e-12


def test_freefall_acceleration_is_minus_g() -> None:
    accel = vertical_acceleration_m_s2(
        vertical_velocity_m_s=0.0,
        thrust_n=0.0,
        mass_kg=MASS_KG,
        gravity_m_s2=G,
        drag_coefficient_kg_per_m=0.0,
    )
    assert accel == -G


def test_heavier_mass_does_not_change_freefall_acceleration() -> None:
    light = vertical_acceleration_m_s2(0.0, 0.0, 0.4, G, 0.0)
    heavy = vertical_acceleration_m_s2(0.0, 0.0, 4.0, G, 0.0)
    assert light == -G
    assert heavy == -G


def test_quadratic_drag_opposes_velocity_and_vanishes_at_rest() -> None:
    climbing = vertical_acceleration_m_s2(2.0, 0.0, MASS_KG, G, drag_coefficient_kg_per_m=0.1)
    descending = vertical_acceleration_m_s2(-2.0, 0.0, MASS_KG, G, drag_coefficient_kg_per_m=0.1)
    resting = vertical_acceleration_m_s2(0.0, 0.0, MASS_KG, G, drag_coefficient_kg_per_m=0.1)
    assert climbing < -G
    assert descending > -G
    assert resting == -G


def test_inelastic_ground_stops_a_drop_and_holds_it() -> None:
    impact_s = math.sqrt(2.0 * Z0_M / G)
    steps = int(math.ceil((impact_s + 1.0) / DT_S))
    trace = _fall(steps, ground_contact=True)
    for time_s, altitude, velocity in trace:
        assert altitude >= -1e-12
        if time_s < impact_s - DT_S:
            expected_z, expected_v = constant_acceleration(time_s, Z0_M, 0.0, -G)
            assert abs(altitude - expected_z) < 1e-9
            assert abs(velocity - expected_v) < 1e-9
    _time, altitude, velocity = trace[-1]
    assert altitude == 0.0
    assert velocity == 0.0
