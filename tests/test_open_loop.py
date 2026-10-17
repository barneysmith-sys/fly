"""Open-loop thrust and the acceleration recorded on each sample."""

from __future__ import annotations

from aerosim.physics.constants import STANDARD_GRAVITY_M_S2
from aerosim.physics.parameters import SimulationConfig, validate_config
from aerosim.simulation.runner import run_simulation, summarize
from tests.analytical import constant_acceleration

G = STANDARD_GRAVITY_M_S2


def _open_loop(
    *,
    thrust_n: float,
    initial_altitude_m: float,
    duration_s: float,
    ground_contact: bool = True,
    mass_kg: float = 1.0,
    thrust_max_n: float = 40.0,
) -> SimulationConfig:
    return SimulationConfig(
        mass_kg=mass_kg,
        gravity_m_s2=G,
        thrust_min_n=0.0,
        thrust_max_n=thrust_max_n,
        drag_coefficient_kg_per_m=0.0,
        external_force_n=0.0,
        initial_altitude_m=initial_altitude_m,
        initial_vertical_velocity_m_s=0.0,
        target_altitude_m=initial_altitude_m,
        kp_n_per_m=0.0,
        ki_n_per_m_s=0.0,
        kd_n_s_per_m=0.0,
        timestep_s=0.05,
        duration_s=duration_s,
        ground_contact=ground_contact,
        control_mode="open_loop",
        open_loop_thrust_n=thrust_n,
    )


def test_open_loop_freefall_matches_the_analytic_solution() -> None:
    result = run_simulation(
        _open_loop(thrust_n=0.0, initial_altitude_m=25.0, duration_s=2.0, ground_contact=False)
    )
    for sample in result.samples:
        expected_z, expected_v = constant_acceleration(sample.time_s, 25.0, 0.0, -G)
        assert abs(sample.altitude_m - expected_z) < 1e-9
        assert abs(sample.vertical_velocity_m_s - expected_v) < 1e-9
        assert sample.vertical_acceleration_m_s2 == -G
        assert sample.thrust_n == 0.0
        assert sample.proportional_n == 0.0
        assert sample.derivative_n == 0.0
    assert result.samples[0].vertical_acceleration_m_s2 == -G


def test_open_loop_hover_holds_altitude() -> None:
    weight_n = G
    result = run_simulation(
        _open_loop(thrust_n=weight_n, initial_altitude_m=2.0, duration_s=2.0)
    )
    for sample in result.samples:
        assert sample.altitude_m == 2.0
        assert sample.vertical_velocity_m_s == 0.0
        assert sample.vertical_acceleration_m_s2 == 0.0
        assert sample.thrust_n == weight_n
    summary = summarize(result)
    assert summary["initial_motion"] == "hold"


def test_open_loop_extra_thrust_accelerates_upward() -> None:
    mass_kg = 1.0
    extra_n = 2.0
    result = run_simulation(
        _open_loop(
            thrust_n=mass_kg * G + extra_n,
            initial_altitude_m=2.0,
            duration_s=1.0,
            mass_kg=mass_kg,
        )
    )
    first = result.samples[0]
    assert abs(first.vertical_acceleration_m_s2 - (extra_n / mass_kg)) < 1e-12
    assert first.altitude_m == 2.0
    assert summarize(result)["initial_motion"] == "climb"


def test_ground_rest_reports_zero_acceleration() -> None:
    result = run_simulation(_open_loop(thrust_n=0.0, initial_altitude_m=0.0, duration_s=1.0))
    for sample in result.samples:
        assert sample.altitude_m == 0.0
        assert sample.vertical_velocity_m_s == 0.0
        assert sample.vertical_acceleration_m_s2 == 0.0
    assert summarize(result)["initial_motion"] == "hold"


def test_pid_hover_first_sample_acceleration_matches_newtons_law() -> None:
    from aerosim.simulation.scenarios import hover_2m_config

    result = run_simulation(hover_2m_config())
    first = result.samples[0]
    specific = (first.thrust_n - G) / 1.0
    assert abs(first.vertical_acceleration_m_s2 - specific) < 1e-12
    assert abs(first.vertical_acceleration_m_s2 - 4.5) < 1e-12
    assert first.saturated is False


def test_open_loop_requires_a_thrust_command() -> None:
    import pytest

    config = _open_loop(thrust_n=1.0, initial_altitude_m=1.0, duration_s=0.5)
    broken = SimulationConfig(**{**config.to_dict(), "open_loop_thrust_n": None})
    with pytest.raises(ValueError, match="open_loop_thrust_n"):
        validate_config(broken)
