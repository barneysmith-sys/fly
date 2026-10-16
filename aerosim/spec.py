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

# Plain-language notes for readers who have not worked in flight dynamics.
# `plain` is also copied into docs/UNITS.md; the test suite checks that.
UNIT_NOTES: tuple[dict[str, object], ...] = (
    {
        "quantity": "Altitude",
        "symbol": "z",
        "unit": "m",
        "primary": True,
        "plain": "Metres above this model's ground, positive upward. 2 m is about the height of a doorway. Pilot displays often show feet instead; 1 m is about 3.28 ft.",
    },
    {
        "quantity": "Vertical velocity",
        "symbol": "v",
        "unit": "m/s",
        "primary": True,
        "plain": "How fast altitude is changing, in metres per second. Positive is climbing. 1 m/s is a slow walk upward, and the hover target is 0 m/s. Knots are a horizontal airspeed unit and are not used here.",
    },
    {
        "quantity": "Thrust and weight",
        "symbol": "T",
        "unit": "N",
        "primary": True,
        "plain": "Newtons of force. One newton accelerates 1 kg at 1 m/s². The weight of the 1 kg vehicle is 9.80665 N. Hobby charts that say grams of thrust mean the mass that force could hover: 1000 g of thrust is about 9.81 N, not 1000 N.",
    },
    {
        "quantity": "Mass",
        "symbol": "m",
        "unit": "kg",
        "primary": True,
        "plain": "Kilograms of matter. Mass is not weight. Weight is the downward force m·g, in newtons. The nominal vehicle is 1 kg, chosen so the gain formulas stay readable.",
    },
    {
        "quantity": "Acceleration",
        "symbol": "a",
        "unit": "m/s²",
        "primary": False,
        "plain": "How quickly vertical velocity changes. With zero thrust the acceleration is −9.80665 m/s², one standard gravity downward. People also call that 1 g. Here g is an acceleration, not a gram.",
    },
    {
        "quantity": "Time",
        "symbol": "t",
        "unit": "s",
        "primary": False,
        "plain": "Seconds from the start of the run. The playhead follows this simulation clock. Playback at 1× spends one wall-clock second per simulation second.",
    },
    {
        "quantity": "Timestep",
        "symbol": "Δt",
        "unit": "s",
        "primary": False,
        "plain": "The shared step of the controller and the integrator. 0.01 s is 10 milliseconds, so the run takes 100 steps for each second of simulation time.",
    },
    {
        "quantity": "Drag coefficient",
        "symbol": "c_d",
        "unit": "kg/m",
        "primary": False,
        "plain": "The lumped number in the drag force −c_d·|v|·v. It is not the dimensionless aerodynamic coefficient C_D. The 2 m hover sets c_d to 0.",
    },
    {
        "quantity": "Proportional gain",
        "symbol": "Kp",
        "unit": "N/m",
        "primary": False,
        "plain": "Extra newtons of thrust for each metre of altitude error. Kp = 2.25 N/m means a vehicle sitting 1 m below the target is commanded 2.25 N above hover thrust, before the other terms.",
    },
    {
        "quantity": "Integral gain",
        "symbol": "Ki",
        "unit": "N/(m·s)",
        "primary": False,
        "plain": "The integral of altitude error is in metre-seconds. Ki converts that accumulation into newtons. Ki = 0 means the accumulated error does not change the thrust.",
    },
    {
        "quantity": "Derivative gain",
        "symbol": "Kd",
        "unit": "N·s/m",
        "primary": False,
        "plain": "Newtons of thrust for each metre per second of vertical-velocity error. With the velocity reference at 0, climbing produces a negative contribution and reduces thrust. The same unit is a damping coefficient, kg/s.",
    },
    {
        "quantity": "Natural frequency",
        "symbol": "ω_n",
        "unit": "rad/s",
        "primary": False,
        "plain": "The designed speed of the response, in radians per second, not propeller RPM. 1.5 rad/s would have a period of about 4.2 s if the motion were a sustained oscillation. This hover design is critically damped, so it does not oscillate.",
    },
    {
        "quantity": "Damping ratio",
        "symbol": "ζ",
        "unit": "1",
        "primary": False,
        "plain": "A dimensionless description of the proportional-derivative design. 1 is critical damping. Above 1 the linear response is slower and still does not oscillate. Below 1 it overshoots.",
    },
    {
        "quantity": "External force",
        "symbol": "F_ext",
        "unit": "N",
        "primary": False,
        "plain": "A constant force added in the equation of motion, positive upward. It is an input used to test the integral term. It is not a wind measurement.",
    },
)

CONVENTIONS: tuple[str, ...] = (
    "Flight dynamics and autopilot code keep the equations in SI units: metres, seconds, kilograms, and newtons. AEROSIM follows that convention.",
    "Pilot-facing displays often use feet, knots, and feet per minute. Those units belong to operations, not to this equation set.",
    "Positive altitude and positive vertical velocity are upward. Many aircraft textbooks use a north-east-down frame, where down is positive. This model does not.",
)

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
        "unit_notes": [dict(note) for note in UNIT_NOTES],
        "conventions": list(CONVENTIONS),
        "assumptions": list(ASSUMPTIONS),
        "limitations": list(LIMITATIONS),
    }
