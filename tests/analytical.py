"""Closed-form checks for the cases the integrator must reproduce.

Free fall and hover use the constant-acceleration solution. The PD step
response is the critically damped continuous closed loop, which the sampled
controller only approaches as dt gets small.
"""

from __future__ import annotations

import math


def constant_acceleration(time_s: float, z0_m: float, v0_m_s: float, accel_m_s2: float) -> tuple[float, float]:
    """z(t) = z0 + v0 t + a t^2 / 2, v(t) = v0 + a t."""

    altitude_m = z0_m + v0_m_s * time_s + 0.5 * accel_m_s2 * time_s * time_s
    velocity_m_s = v0_m_s + accel_m_s2 * time_s
    return altitude_m, velocity_m_s


def critically_damped_step(
    time_s: float,
    amplitude_m: float,
    natural_frequency_rad_s: float,
) -> tuple[float, float]:
    """Step response of z'' + 2 ω z' + ω^2 z = ω^2 A from rest at the origin.

    z(t) = A (1 - exp(-ω t) (1 + ω t))
    v(t) = A ω^2 t exp(-ω t)
    """

    if time_s < 0.0:
        raise ValueError("time_s must be >= 0")
    omega_t = natural_frequency_rad_s * time_s
    decay = math.exp(-omega_t)
    altitude_m = amplitude_m * (1.0 - decay * (1.0 + omega_t))
    velocity_m_s = amplitude_m * natural_frequency_rad_s**2 * time_s * decay
    return altitude_m, velocity_m_s
