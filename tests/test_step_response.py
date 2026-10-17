"""Altitude step of the PD loop, compared with the continuous design."""

from __future__ import annotations

from aerosim.control.pid import altitude_pd_gains
from aerosim.physics.constants import STANDARD_GRAVITY_M_S2
from aerosim.physics.parameters import SimulationConfig
from aerosim.simulation.runner import run_simulation
from aerosim.simulation.scenarios import (
    DAMPING_RATIO,
    NATURAL_FREQUENCY_RAD_S,
    hover_2m_config,
)
from tests.analytical import critically_damped_step

G = STANDARD_GRAVITY_M_S2
TARGET_M = 2.0


def _pd_config(timestep_s: float, duration_s: float, initial_altitude_m: float) -> SimulationConfig:
    kp, kd = altitude_pd_gains(1.0, NATURAL_FREQUENCY_RAD_S, DAMPING_RATIO)
    steps = int(round(duration_s / timestep_s))
    duration_s = steps * timestep_s
    return SimulationConfig(
        mass_kg=1.0,
        gravity_m_s2=G,
        thrust_min_n=0.0,
        thrust_max_n=2.0 * G,
        drag_coefficient_kg_per_m=0.0,
        external_force_n=0.0,
        initial_altitude_m=initial_altitude_m,
        initial_vertical_velocity_m_s=0.0,
        target_altitude_m=TARGET_M,
        kp_n_per_m=kp,
        ki_n_per_m_s=0.0,
        kd_n_s_per_m=kd,
        timestep_s=timestep_s,
        duration_s=duration_s,
        ground_contact=False,
        natural_frequency_rad_s=NATURAL_FREQUENCY_RAD_S,
        damping_ratio=DAMPING_RATIO,
    )


def _max_continuous_error(timestep_s: float) -> float:
    result = run_simulation(_pd_config(timestep_s, 12.0, 0.0))
    worst = 0.0
    for sample in result.samples:
        altitude, velocity = critically_damped_step(
            sample.time_s, TARGET_M, NATURAL_FREQUENCY_RAD_S
        )
        worst = max(worst, abs(sample.altitude_m - altitude), abs(sample.vertical_velocity_m_s - velocity))
    return worst


def test_finer_timestep_tracks_the_continuous_pd_solution_more_closely() -> None:
    coarse = _max_continuous_error(0.02)
    fine = _max_continuous_error(0.005)
    assert fine < coarse
    assert fine < 5e-3


def test_pd_step_settles_on_two_metres() -> None:
    result = run_simulation(_pd_config(0.01, 12.0, 0.0))
    final = result.samples[-1]
    assert abs(final.altitude_m - TARGET_M) < 1e-3
    assert abs(final.vertical_velocity_m_s) < 1e-3
    assert max(sample.altitude_m for sample in result.samples) < TARGET_M + 0.05
    assert result.acceptance["passed"] is True


def test_derivative_term_is_zero_at_rest_on_the_first_sample() -> None:
    result = run_simulation(_pd_config(0.01, 1.0, 0.0))
    first = result.samples[0]
    assert first.vertical_velocity_m_s == 0.0
    assert first.derivative_n == 0.0
    assert first.proportional_n == first.thrust_command_n - first.feedforward_n


def test_command_terms_sum_to_the_thrust_command() -> None:
    result = run_simulation(hover_2m_config())
    for sample in result.samples:
        total = (
            sample.feedforward_n
            + sample.proportional_n
            + sample.integral_term_n
            + sample.derivative_n
        )
        assert abs(total - sample.thrust_command_n) < 1e-9


def test_decade_integral_gain_is_still_high_at_twelve_seconds() -> None:
    """A large step winds I up even though thrust is inside the limits.

    Ki = Kp * omega_n / 10 is the decade rule. On this plant it is stable and
    it does not meet the 0.02 m hover band at t = 12 s. The milestone leaves
    Ki at 0 because of this, not because the integral term is unimplemented.
    """

    kp, kd = altitude_pd_gains(1.0, NATURAL_FREQUENCY_RAD_S, DAMPING_RATIO)
    ki = kp * NATURAL_FREQUENCY_RAD_S / 10.0
    result = run_simulation(
        SimulationConfig(
            mass_kg=1.0,
            gravity_m_s2=G,
            thrust_min_n=0.0,
            thrust_max_n=2.0 * G,
            drag_coefficient_kg_per_m=0.0,
            external_force_n=0.0,
            initial_altitude_m=0.0,
            initial_vertical_velocity_m_s=0.0,
            target_altitude_m=TARGET_M,
            kp_n_per_m=kp,
            ki_n_per_m_s=ki,
            kd_n_s_per_m=kd,
            timestep_s=0.01,
            duration_s=12.0,
            ground_contact=True,
        )
    )
    final_error_m = result.samples[-1].altitude_m - TARGET_M
    assert final_error_m > 0.05
    assert max(sample.altitude_m for sample in result.samples) < TARGET_M + 1.0
    assert any(sample.saturated for sample in result.samples) is False


def test_integral_rejects_a_constant_upward_force() -> None:
    kp, kd = altitude_pd_gains(1.0, NATURAL_FREQUENCY_RAD_S, DAMPING_RATIO)
    bias_n = 0.5
    without = run_simulation(
        SimulationConfig(
            mass_kg=1.0,
            gravity_m_s2=G,
            thrust_min_n=0.0,
            thrust_max_n=30.0,
            drag_coefficient_kg_per_m=0.0,
            external_force_n=bias_n,
            initial_altitude_m=TARGET_M,
            initial_vertical_velocity_m_s=0.0,
            target_altitude_m=TARGET_M,
            kp_n_per_m=kp,
            ki_n_per_m_s=0.0,
            kd_n_s_per_m=kd,
            timestep_s=0.01,
            duration_s=20.0,
            ground_contact=False,
        )
    )
    with_integral = run_simulation(
        SimulationConfig(
            mass_kg=1.0,
            gravity_m_s2=G,
            thrust_min_n=0.0,
            thrust_max_n=30.0,
            drag_coefficient_kg_per_m=0.0,
            external_force_n=bias_n,
            initial_altitude_m=TARGET_M,
            initial_vertical_velocity_m_s=0.0,
            target_altitude_m=TARGET_M,
            kp_n_per_m=kp,
            ki_n_per_m_s=0.8,
            kd_n_s_per_m=kd,
            timestep_s=0.01,
            duration_s=40.0,
            ground_contact=False,
        )
    )
    pd_offset = without.samples[-1].altitude_m - TARGET_M
    # Extra upward force is balanced by a negative proportional term: z > z_ref.
    assert abs(pd_offset - (bias_n / kp)) < 0.02
    assert abs(with_integral.samples[-1].altitude_m - TARGET_M) < 0.02
    assert abs(with_integral.samples[-1].vertical_velocity_m_s) < 0.02
