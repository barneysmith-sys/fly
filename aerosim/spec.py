"""Text of the model that the API and the manual both have to carry.

docs/MODEL.md must contain each equation string verbatim. The test suite
checks that, so the manual cannot drift from the code.
"""

from aerosim.control.pid import EQUATION_CONTROL, EQUATION_PD_GAINS, EQUATION_VELOCITY_REFERENCE
from aerosim.physics.dynamics import (
    EQUATION_KINEMATICS,
    EQUATION_RK4,
    EQUATION_SATURATION,
    EQUATION_TRANSLATION,
)

EQUATIONS: dict[str, str] = {
    "kinematics": EQUATION_KINEMATICS,
    "translation": EQUATION_TRANSLATION,
    "saturation": EQUATION_SATURATION,
    "rk4": EQUATION_RK4,
    "control": EQUATION_CONTROL,
    "pd_gains": EQUATION_PD_GAINS,
    "velocity_reference": EQUATION_VELOCITY_REFERENCE,
}

UNITS: dict[str, str] = {
    "altitude": "m",
    "vertical_velocity": "m/s",
    "acceleration": "m/s^2",
    "mass": "kg",
    "force": "N",
    "time": "s",
    "drag_coefficient": "kg/m",
    "kp": "N/m",
    "ki": "N/(m*s)",
    "kd": "N*s/m",
    "natural_frequency": "rad/s",
    "damping_ratio": "1",
}

ASSUMPTIONS: tuple[str, ...] = (
    "Motion is confined to a vertical line. Attitude is level, so thrust is aligned with +z and produces no torque.",
    "The vehicle is a constant point mass. Nothing is consumed and nothing is dropped.",
    "z is positive upward. When ground contact is enabled, z = 0 is a rigid plane.",
    "Gravity is the constant standard value unless the run overrides it. It does not change with height.",
    "Thrust is an ideal bounded force. There is no motor lag, battery limit, or propeller model.",
    "Drag is a quadratic vertical force -c_d*|v|*v. The 2 m hover sets c_d = 0.",
    "F_ext is a constant vertical force, positive upward. The 2 m hover sets it to 0.",
    "The controller is given the true altitude and true vertical velocity at each sample. No sensor is modeled.",
    "v_ref is 0. The reference is a constant altitude, not a trajectory.",
    "Gravity feedforward uses the same mass and g as the plant.",
    "Thrust is held constant between samples. The plant step is classical fourth-order Runge-Kutta.",
    "Ground contact is a perfectly inelastic projection onto z = 0 after the step, plus a rest condition when the net acceleration is not upward.",
)

LIMITATIONS: tuple[str, ...] = (
    "This is not a six-degree-of-freedom model. It cannot roll, pitch, yaw, or translate horizontally.",
    "There is no navigation, no waypoint, and no path. The only reference is a constant altitude.",
    "There is no IMU, GPS, barometer, or estimator. Plots are the integrated state.",
    "Inelastic ground contact deletes the descent speed. It is not a landing-gear model.",
    "The sampled PID differs from the continuous design by the zero-order hold. The difference shrinks with the timestep.",
    "Gains come from the double-integrator pole formulas, not from a system identification on a vehicle.",
    "A step command with Ki > 0 integrates a large climb error even when thrust is not saturated. That residual keeps the vehicle above the reference after the PD transient has died. The 2 m hover therefore uses Ki = 0. A separate test sets Ki > 0 and checks rejection of a constant external force.",
    "No wind, ground effect, air-density change, or structural mode is modeled.",
)


def model_document() -> dict[str, object]:
    """Structured model description served next to every run."""

    return {
        "name": "AEROSIM vertical point mass",
        "version": "0.1.0",
        "equations": EQUATIONS,
        "units": UNITS,
        "assumptions": list(ASSUMPTIONS),
        "limitations": list(LIMITATIONS),
    }
