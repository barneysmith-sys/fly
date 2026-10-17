"""Thrust is a bounded force, in open loop and in the controller."""

from __future__ import annotations

from aerosim.control.pid import altitude_pid
from aerosim.physics.constants import STANDARD_GRAVITY_M_S2
from aerosim.physics.dynamics import step_vertical, vertical_acceleration_m_s2
from aerosim.physics.parameters import SimulationConfig
from aerosim.simulation.runner import run_simulation

G = STANDARD_GRAVITY_M_S2
MASS_KG = 1.0
T_MAX_N = 12.0


def test_open_loop_command_above_the_limit_accelerates_at_the_limit() -> None:
    capped = vertical_acceleration_m_s2(0.0, T_MAX_N, MASS_KG, G, 0.0)
    altitude, velocity, applied = step_vertical(
        altitude_m=1.0,
        vertical_velocity_m_s=0.0,
        thrust_command_n=10_000.0,
        timestep_s=0.01,
        mass_kg=MASS_KG,
        gravity_m_s2=G,
        thrust_min_n=0.0,
        thrust_max_n=T_MAX_N,
        drag_coefficient_kg_per_m=0.0,
    )
    assert applied == T_MAX_N
    assert abs((velocity / 0.01) - capped) < 1e-9
    assert altitude > 1.0


def test_open_loop_negative_command_is_clamped_to_zero() -> None:
    _altitude, velocity, applied = step_vertical(
        altitude_m=3.0,
        vertical_velocity_m_s=0.0,
        thrust_command_n=-25.0,
        timestep_s=0.01,
        mass_kg=MASS_KG,
        gravity_m_s2=G,
        thrust_min_n=0.0,
        thrust_max_n=T_MAX_N,
        drag_coefficient_kg_per_m=0.0,
        ground_contact=False,
    )
    assert applied == 0.0
    assert abs(velocity - (-G * 0.01)) < 1e-9


def test_pid_large_positive_error_saturates_high_and_freezes_the_integral() -> None:
    first = altitude_pid(
        altitude_m=0.0,
        vertical_velocity_m_s=0.0,
        target_altitude_m=50.0,
        integral_m_s=0.0,
        timestep_s=0.01,
        mass_kg=MASS_KG,
        gravity_m_s2=G,
        thrust_min_n=0.0,
        thrust_max_n=T_MAX_N,
        kp_n_per_m=20.0,
        ki_n_per_m_s=5.0,
        kd_n_s_per_m=3.0,
    )
    assert first.thrust_command_n > T_MAX_N
    assert first.thrust_n == T_MAX_N
    assert first.saturated is True
    assert first.integral_m_s == 0.0

    second = altitude_pid(
        altitude_m=0.0,
        vertical_velocity_m_s=0.0,
        target_altitude_m=50.0,
        integral_m_s=first.integral_m_s,
        timestep_s=0.01,
        mass_kg=MASS_KG,
        gravity_m_s2=G,
        thrust_min_n=0.0,
        thrust_max_n=T_MAX_N,
        kp_n_per_m=20.0,
        ki_n_per_m_s=5.0,
        kd_n_s_per_m=3.0,
    )
    assert second.integral_m_s == 0.0
    assert second.thrust_n == T_MAX_N


def test_pid_large_negative_error_saturates_at_zero() -> None:
    output = altitude_pid(
        altitude_m=20.0,
        vertical_velocity_m_s=0.0,
        target_altitude_m=0.0,
        integral_m_s=0.0,
        timestep_s=0.01,
        mass_kg=MASS_KG,
        gravity_m_s2=G,
        thrust_min_n=0.0,
        thrust_max_n=T_MAX_N,
        kp_n_per_m=20.0,
        ki_n_per_m_s=1.0,
        kd_n_s_per_m=1.0,
    )
    assert output.thrust_command_n < 0.0
    assert output.thrust_n == 0.0
    assert output.integral_m_s == 0.0


def test_closed_loop_trace_never_applies_thrust_outside_the_bounds() -> None:
    config = SimulationConfig(
        mass_kg=MASS_KG,
        gravity_m_s2=G,
        thrust_min_n=0.0,
        thrust_max_n=T_MAX_N,
        drag_coefficient_kg_per_m=0.0,
        external_force_n=0.0,
        initial_altitude_m=0.0,
        initial_vertical_velocity_m_s=0.0,
        target_altitude_m=30.0,
        kp_n_per_m=40.0,
        ki_n_per_m_s=8.0,
        kd_n_s_per_m=4.0,
        timestep_s=0.01,
        duration_s=2.0,
        ground_contact=True,
    )
    result = run_simulation(config)
    assert any(sample.saturated for sample in result.samples)
    assert any(sample.thrust_command_n > T_MAX_N for sample in result.samples)
    for sample in result.samples:
        assert 0.0 <= sample.thrust_n <= T_MAX_N
