"""Named scenarios. The only milestone scenario is a 2 m hover.

Nominal vehicle
    mass = 1 kg
        Chosen so the gain formulas stay readable. It is not a weighed airframe.
    thrust-to-weight = 2
        T_max = 2 * m * g. Rotors in this model produce thrust in one direction,
        so T_min = 0.
    c_d = 0, F_ext = 0
        The milestone plant is the double integrator used to derive the gains.

Controller
    omega_n = 1.5 rad/s, zeta = 1
        Kp = m * omega_n^2 = 2.25 N/m
        Kd = 2 * zeta * omega_n * m = 3 N·s/m
    Ki = 0
        Weight is already cancelled by the matched m*g feedforward, and with
        F_ext = 0 the equilibrium integral is zero. A nonzero Ki on this step
        accumulates the climb error and leaves the vehicle high at t = 12 s.
        The PID law still implements Ki; a separate test sets it above zero
        and checks rejection of a constant external force.

Initial state
    On the ground, at rest. The reference is a step to 2 m at t = 0.
    There is no trajectory generator and no navigation loop.
"""

from __future__ import annotations

from aerosim.control.pid import altitude_pd_gains
from aerosim.physics.constants import STANDARD_GRAVITY_M_S2
from aerosim.physics.parameters import SimulationConfig

HOVER_ALTITUDE_M = 2.0
NOMINAL_MASS_KG = 1.0
THRUST_TO_WEIGHT = 2.0
NATURAL_FREQUENCY_RAD_S = 1.5
DAMPING_RATIO = 1.0
TIMESTEP_S = 0.01
DURATION_S = 12.0


def hover_2m_config() -> SimulationConfig:
    """Return the canonical 2 m hover. Every run of this config is the same."""

    kp_n_per_m, kd_n_s_per_m = altitude_pd_gains(
        mass_kg=NOMINAL_MASS_KG,
        natural_frequency_rad_s=NATURAL_FREQUENCY_RAD_S,
        damping_ratio=DAMPING_RATIO,
    )
    ki_n_per_m_s = 0.0
    weight_n = NOMINAL_MASS_KG * STANDARD_GRAVITY_M_S2
    return SimulationConfig(
        mass_kg=NOMINAL_MASS_KG,
        gravity_m_s2=STANDARD_GRAVITY_M_S2,
        thrust_min_n=0.0,
        thrust_max_n=THRUST_TO_WEIGHT * weight_n,
        drag_coefficient_kg_per_m=0.0,
        external_force_n=0.0,
        initial_altitude_m=0.0,
        initial_vertical_velocity_m_s=0.0,
        target_altitude_m=HOVER_ALTITUDE_M,
        kp_n_per_m=kp_n_per_m,
        ki_n_per_m_s=ki_n_per_m_s,
        kd_n_s_per_m=kd_n_s_per_m,
        timestep_s=TIMESTEP_S,
        duration_s=DURATION_S,
        ground_contact=True,
        velocity_reference_m_s=0.0,
        natural_frequency_rad_s=NATURAL_FREQUENCY_RAD_S,
        damping_ratio=DAMPING_RATIO,
    )
