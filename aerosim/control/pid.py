"""Single-loop PID altitude controller with gravity feedforward.

Continuous law, v_ref held at the configured reference (0 in this version):

    e = z_ref - z
    T_cmd = m*g + Kp*(z_ref - z) + Ki*integral(z_ref - z) dt + Kd*(v_ref - v)
    T = clamp(T_cmd, T_min, T_max)

The derivative term is computed from vertical velocity, not from a backward
difference of the altitude error. A step in z_ref therefore does not produce
a one-sample derivative spike.

On the double-integrator plant m*z'' = u, with u = T - m*g, F_ext = 0,
c_d = 0, and Ki = 0, the PD gains

    Kp = m * omega_n^2
    Kd = 2 * zeta * omega_n * m

place the closed-loop poles of the continuous system at damping zeta and
natural frequency omega_n. The closed-loop DC gain of that PD law is 1, so a
constant altitude reference has zero steady-state error when the feedforward
mass and gravity match the plant and F_ext is zero. The equilibrium integral
is then zero as well. A nonzero Ki is still implemented: it rejects a constant
external force, and it is what makes the steady thrust equal m*g - F_ext
without a permanent altitude offset.

Discrete update at sample k, using the true state (there is no estimator):

    e_k = z_ref - z_k
    I_candidate = I_k + e_k * dt
    T_cmd from I_candidate
    if T_cmd is above T_max and e_k > 0, or below T_min and e_k < 0:
        keep I_k (conditional integration anti-windup)
    else:
        keep I_candidate

Conditional integration is not back-calculation. While the command is
saturated in the same direction as the error, the integral state is frozen.
"""

from __future__ import annotations

from dataclasses import dataclass

from aerosim.physics.dynamics import clamp

EQUATION_CONTROL = (
    "T_cmd = m*g + Kp*(z_ref - z) + Ki*integral(z_ref - z) dt + Kd*(v_ref - v)"
)
EQUATION_PD_GAINS = "Kp = m*omega_n^2; Kd = 2*zeta*omega_n*m"
EQUATION_VELOCITY_REFERENCE = "v_ref = 0"


@dataclass(frozen=True)
class PidOutput:
    """Command computed from one measured state. All forces are in newtons."""

    feedforward_n: float
    proportional_n: float
    integral_term_n: float
    derivative_n: float
    thrust_command_n: float
    thrust_n: float
    altitude_error_m: float
    integral_m_s: float
    saturated: bool


def constant_thrust(
    thrust_command_n: float,
    altitude_m: float,
    target_altitude_m: float,
    thrust_min_n: float,
    thrust_max_n: float,
) -> PidOutput:
    """Hold one thrust command. This is not a controller and not a PID.

    The proportional, integral, and derivative terms are recorded as zero
    because they were not evaluated. Their sum is therefore not the command.
    """

    thrust_n = clamp(thrust_command_n, thrust_min_n, thrust_max_n)
    return PidOutput(
        feedforward_n=0.0,
        proportional_n=0.0,
        integral_term_n=0.0,
        derivative_n=0.0,
        thrust_command_n=thrust_command_n,
        thrust_n=thrust_n,
        altitude_error_m=target_altitude_m - altitude_m,
        integral_m_s=0.0,
        saturated=thrust_n != thrust_command_n,
    )


def altitude_pd_gains(
    mass_kg: float,
    natural_frequency_rad_s: float,
    damping_ratio: float,
) -> tuple[float, float]:
    """Return (Kp in N/m, Kd in N·s/m) for the matched double integrator."""

    if mass_kg <= 0.0:
        raise ValueError("mass_kg must be > 0")
    if natural_frequency_rad_s <= 0.0:
        raise ValueError("natural_frequency_rad_s must be > 0")
    if damping_ratio < 0.0:
        raise ValueError("damping_ratio must be >= 0")
    kp_n_per_m = mass_kg * natural_frequency_rad_s * natural_frequency_rad_s
    kd_n_s_per_m = 2.0 * damping_ratio * natural_frequency_rad_s * mass_kg
    return kp_n_per_m, kd_n_s_per_m


def altitude_pid(
    *,
    altitude_m: float,
    vertical_velocity_m_s: float,
    target_altitude_m: float,
    integral_m_s: float,
    timestep_s: float,
    mass_kg: float,
    gravity_m_s2: float,
    thrust_min_n: float,
    thrust_max_n: float,
    kp_n_per_m: float,
    ki_n_per_m_s: float,
    kd_n_s_per_m: float,
    velocity_reference_m_s: float = 0.0,
) -> PidOutput:
    """One PID update. The caller owns the integral state between calls."""

    if timestep_s <= 0.0:
        raise ValueError("timestep_s must be > 0")

    error_m = target_altitude_m - altitude_m
    feedforward_n = mass_kg * gravity_m_s2
    proportional_n = kp_n_per_m * error_m
    derivative_n = kd_n_s_per_m * (velocity_reference_m_s - vertical_velocity_m_s)

    candidate_integral_m_s = integral_m_s + error_m * timestep_s
    candidate_integral_n = ki_n_per_m_s * candidate_integral_m_s
    command_n = feedforward_n + proportional_n + candidate_integral_n + derivative_n

    winding_up = (command_n > thrust_max_n and error_m > 0.0) or (
        command_n < thrust_min_n and error_m < 0.0
    )
    if winding_up:
        integral_out_m_s = integral_m_s
        integral_term_n = ki_n_per_m_s * integral_out_m_s
        command_n = feedforward_n + proportional_n + integral_term_n + derivative_n
    else:
        integral_out_m_s = candidate_integral_m_s
        integral_term_n = candidate_integral_n

    thrust_n = clamp(command_n, thrust_min_n, thrust_max_n)
    return PidOutput(
        feedforward_n=feedforward_n,
        proportional_n=proportional_n,
        integral_term_n=integral_term_n,
        derivative_n=derivative_n,
        thrust_command_n=command_n,
        thrust_n=thrust_n,
        altitude_error_m=error_m,
        integral_m_s=integral_out_m_s,
        saturated=thrust_n != command_n,
    )
