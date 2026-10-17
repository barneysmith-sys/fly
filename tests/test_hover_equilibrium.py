"""A matched hover thrust holds a constant altitude."""

from __future__ import annotations

from aerosim.physics.constants import STANDARD_GRAVITY_M_S2
from aerosim.physics.dynamics import step_vertical
from aerosim.physics.parameters import SimulationConfig
from aerosim.simulation.runner import run_simulation

G = STANDARD_GRAVITY_M_S2


def test_open_loop_weight_thrust_holds_altitude() -> None:
    mass_kg = 0.5
    hover_thrust_n = mass_kg * G
    altitude = 2.0
    velocity = 0.0
    for _ in range(500):
        altitude, velocity, applied = step_vertical(
            altitude_m=altitude,
            vertical_velocity_m_s=velocity,
            thrust_command_n=hover_thrust_n,
            timestep_s=0.01,
            mass_kg=mass_kg,
            gravity_m_s2=G,
            thrust_min_n=0.0,
            thrust_max_n=4.0 * hover_thrust_n,
            drag_coefficient_kg_per_m=0.0,
            ground_contact=False,
        )
        assert applied == hover_thrust_n
        assert altitude == 2.0
        assert velocity == 0.0


def test_closed_loop_hover_from_the_reference_does_not_move() -> None:
    mass_kg = 1.0
    config = SimulationConfig(
        mass_kg=mass_kg,
        gravity_m_s2=G,
        thrust_min_n=0.0,
        thrust_max_n=2.0 * mass_kg * G,
        drag_coefficient_kg_per_m=0.25,
        external_force_n=0.0,
        initial_altitude_m=2.0,
        initial_vertical_velocity_m_s=0.0,
        target_altitude_m=2.0,
        kp_n_per_m=2.25,
        ki_n_per_m_s=0.3,
        kd_n_s_per_m=3.0,
        timestep_s=0.01,
        duration_s=5.0,
        ground_contact=False,
    )
    result = run_simulation(config)
    hover_thrust_n = mass_kg * G
    for sample in result.samples:
        assert sample.altitude_m == 2.0
        assert sample.vertical_velocity_m_s == 0.0
        assert sample.altitude_error_m == 0.0
        assert sample.thrust_n == hover_thrust_n
        assert sample.saturated is False


def test_drag_does_not_shift_the_hover_point() -> None:
    """Quadratic drag is zero at zero speed, so trim thrust remains m*g."""

    accel_mass = 1.7
    hover = accel_mass * G
    altitude, velocity, applied = step_vertical(
        altitude_m=4.0,
        vertical_velocity_m_s=0.0,
        thrust_command_n=hover,
        timestep_s=0.02,
        mass_kg=accel_mass,
        gravity_m_s2=G,
        thrust_min_n=0.0,
        thrust_max_n=hover * 3.0,
        drag_coefficient_kg_per_m=0.8,
        ground_contact=False,
    )
    assert applied == hover
    assert abs(altitude - 4.0) < 1e-9
    assert abs(velocity) < 1e-9
