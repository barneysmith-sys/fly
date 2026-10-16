"""Vertical point-mass dynamics and fixed-step Runge-Kutta integration.

Continuous model, with z positive upward in metres and v = dz/dt in m/s:

    dz/dt = v
    m*dv/dt = T - m*g - c_d*|v|*v + F_ext

T is the thrust applied over a step. It is clamped to [T_min, T_max] before
it enters the derivative, so the integrator never sees an infeasible force.
F_ext is a constant external vertical force in newtons, positive upward.
c_d is the quadratic drag coefficient in kg/m. With c_d = 0 and F_ext = 0 the
specific force is T/m - g.

The derivative is Lipschitz in v for a finite drag coefficient, so a unique
solution exists. Classical RK4 advances that ODE with thrust held constant
across the step (zero-order hold). For constant acceleration the solution is
a polynomial of degree 2, which RK4 reproduces to roundoff. With drag or a
state-dependent thrust the global error of the sampled closed loop is not the
same object as the local truncation error of the ODE; both shrink as the
timestep shrinks.

Ground contact, when enabled, is applied outside the RK4 stages. It is a
discrete projection, not a contact model inside the ODE.
"""

from __future__ import annotations

EQUATION_KINEMATICS = "dz/dt = v"
EQUATION_TRANSLATION = "m*dv/dt = T - m*g - c_d*|v|*v + F_ext"
EQUATION_SATURATION = "T = clamp(T_cmd, T_min, T_max)"
EQUATION_RK4 = "x_next = x + (dt/6) * (k1 + 2*k2 + 2*k3 + k4)"


def clamp(value: float, lower: float, upper: float) -> float:
    """Return value restricted to [lower, upper]."""

    if lower > upper:
        raise ValueError("lower bound must be <= upper bound")
    if value < lower:
        return lower
    if value > upper:
        return upper
    return value


def vertical_acceleration_m_s2(
    vertical_velocity_m_s: float,
    thrust_n: float,
    mass_kg: float,
    gravity_m_s2: float,
    drag_coefficient_kg_per_m: float,
    external_force_n: float = 0.0,
) -> float:
    """Specific force along +z from Newton's second law.

    drag force = -c_d * |v| * v newtons. It opposes vertical velocity and is
    zero at v = 0, so it does not shift the hover thrust.
    """

    drag_n = -drag_coefficient_kg_per_m * abs(vertical_velocity_m_s) * vertical_velocity_m_s
    return (thrust_n + drag_n + external_force_n) / mass_kg - gravity_m_s2


def step_vertical(
    altitude_m: float,
    vertical_velocity_m_s: float,
    thrust_command_n: float,
    timestep_s: float,
    mass_kg: float,
    gravity_m_s2: float,
    thrust_min_n: float,
    thrust_max_n: float,
    drag_coefficient_kg_per_m: float,
    external_force_n: float = 0.0,
    ground_contact: bool = False,
) -> tuple[float, float, float]:
    """Advance the plant by one zero-order-held thrust step.

    Returns (altitude_m, vertical_velocity_m_s, thrust_applied_n).

    If ground contact is enabled and the vehicle is on the surface with no
    upward velocity, a non-positive acceleration leaves it at rest: the ground
    reaction cancels the downward net force and is not stored as a state.
    After an airborne step that crosses z = 0, the state is projected to
    z = 0, v = 0. That impact is perfectly inelastic. Kinetic energy is
    removed and is not recovered on the next step.
    """

    if timestep_s <= 0.0:
        raise ValueError("timestep_s must be > 0")
    thrust_n = clamp(thrust_command_n, thrust_min_n, thrust_max_n)

    if ground_contact and altitude_m <= 0.0 and vertical_velocity_m_s <= 0.0:
        accel = vertical_acceleration_m_s2(
            vertical_velocity_m_s=0.0,
            thrust_n=thrust_n,
            mass_kg=mass_kg,
            gravity_m_s2=gravity_m_s2,
            drag_coefficient_kg_per_m=drag_coefficient_kg_per_m,
            external_force_n=external_force_n,
        )
        if accel <= 0.0:
            return 0.0, 0.0, thrust_n

    next_altitude, next_velocity = _rk4(
        altitude_m=altitude_m,
        vertical_velocity_m_s=vertical_velocity_m_s,
        thrust_n=thrust_n,
        timestep_s=timestep_s,
        mass_kg=mass_kg,
        gravity_m_s2=gravity_m_s2,
        drag_coefficient_kg_per_m=drag_coefficient_kg_per_m,
        external_force_n=external_force_n,
    )
    if ground_contact and next_altitude < 0.0:
        return 0.0, 0.0, thrust_n
    return next_altitude, next_velocity, thrust_n


def _rk4(
    altitude_m: float,
    vertical_velocity_m_s: float,
    thrust_n: float,
    timestep_s: float,
    mass_kg: float,
    gravity_m_s2: float,
    drag_coefficient_kg_per_m: float,
    external_force_n: float,
) -> tuple[float, float]:
    def derivatives(z: float, v: float) -> tuple[float, float]:
        accel = vertical_acceleration_m_s2(
            vertical_velocity_m_s=v,
            thrust_n=thrust_n,
            mass_kg=mass_kg,
            gravity_m_s2=gravity_m_s2,
            drag_coefficient_kg_per_m=drag_coefficient_kg_per_m,
            external_force_n=external_force_n,
        )
        return v, accel

    z1, v1 = derivatives(altitude_m, vertical_velocity_m_s)
    z2, v2 = derivatives(
        altitude_m + 0.5 * timestep_s * z1,
        vertical_velocity_m_s + 0.5 * timestep_s * v1,
    )
    z3, v3 = derivatives(
        altitude_m + 0.5 * timestep_s * z2,
        vertical_velocity_m_s + 0.5 * timestep_s * v2,
    )
    z4, v4 = derivatives(
        altitude_m + timestep_s * z3,
        vertical_velocity_m_s + timestep_s * v3,
    )
    next_altitude = altitude_m + (timestep_s / 6.0) * (z1 + 2.0 * z2 + 2.0 * z3 + z4)
    next_velocity = vertical_velocity_m_s + (timestep_s / 6.0) * (v1 + 2.0 * v2 + 2.0 * v3 + v4)
    return next_altitude, next_velocity
