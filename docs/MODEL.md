# AEROSIM vertical model

This is the model implemented in `aerosim`. Version 0.1 is a one-dimensional
vertical-flight simulation of a point-mass quadcopter. The numbers a run
prints are outputs of these equations. They are not sensor logs and they are
not flight-test data.

## Coordinate system and units

| Symbol | Meaning | Unit |
| --- | --- | --- |
| z | Altitude, positive upward | m |
| v | Vertical velocity, dz/dt, positive upward | m/s |
| t | Time from the start of the run | s |
| m | Vehicle mass | kg |
| g | Gravitational acceleration | m/s² |
| T | Thrust applied to the plant, positive upward | N |
| T_cmd | Thrust requested by the controller | N |
| T_min, T_max | Thrust bounds | N |
| c_d | Quadratic drag coefficient | kg/m |
| F_ext | Constant external force, positive upward | N |
| Kp | Proportional gain | N/m |
| Ki | Integral gain | N/(m·s) |
| Kd | Derivative gain | N·s/m |
| ω_n | Natural frequency used to choose Kp and Kd | rad/s |
| ζ | Damping ratio used to choose Kd | dimensionless |

Standard gravity in the 2 m hover is the conventional value 9.80665 m/s².
A run may override `gravity_m_s2`. The override is still a constant.

What the units mean, and how they differ from feet, knots, and hobby
"grams of thrust," is written out in [UNITS.md](UNITS.md).

## State

The plant state is (z, v). The controller state is the integral of altitude
error, in m·s, starting at 0. The sample clock is part of the simulation
state. Thrust is not an independent state: at each sample it is fixed by the
control law and then held until the next sample.

## Forces

Three vertical forces and one optional bias:

- Weight, m·g, downward.
- Thrust, T, upward, with T_min ≤ T ≤ T_max.
- Quadratic drag, −c_d · |v| · v. Climbing flight produces a downward drag.
  At v = 0 the drag is zero, so it does not change the hover thrust.
- External force F_ext, constant, positive upward. The 2 m hover sets it to 0.
  It exists so the integral term can be checked against a known bias.

The model has no lateral force, no moment, and no rotor inertia.

## Equations of motion

```
dz/dt = v
m*dv/dt = T - m*g - c_d*|v|*v + F_ext
```

With c_d = 0 and F_ext = 0 this is

```
dv/dt = T/m - g
```

Free fall is the special case T = 0, c_d = 0, F_ext = 0:

```
v(t) = v0 - g t
z(t) = z0 + v0 t - g t² / 2
```

Hover equilibrium, for any c_d, is v = 0 and T + F_ext = m·g. In the milestone
F_ext = 0, so the hover thrust is exactly m·g.

## Thrust bound

```
T = clamp(T_cmd, T_min, T_max)
```

T_min is 0 in every scenario shipped here. The rotors are not allowed to
pull downward. The plant clamps again even if a caller passes a command that
is already saturated, so an out-of-range force cannot enter the integrator.

## Numerical integration

Classical fourth-order Runge-Kutta, with thrust constant on the step:

```
x_next = x + (dt/6) * (k1 + 2*k2 + 2*k3 + k4)
```

x is the column (z, v). Each k_i is the derivative (v, acceleration)
evaluated at the RK4 stage. Because free fall and hover have acceleration
that is constant along the step, their solutions are polynomials of degree
at most 2. RK4 integrates those exactly, up to floating-point roundoff.
The tests check free fall and hover against that closed form.

The sample time is k · dt, not a running sum of dt.

## Ground

Ground contact is optional.

- If z ≤ 0, v ≤ 0, and the acceleration from the applied thrust is not
  positive, the vehicle stays at z = 0, v = 0. The ground reaction is whatever
  force is required to enforce that, and it is not a stored state.
- If a step would finish below z = 0, the state is set to z = 0, v = 0.
  The impact is perfectly inelastic. The descent speed is deleted.

The projection is applied after the RK4 step, not inside the stages. A large
timestep can cross the plane in one step. Energy is not conserved at impact.

## Control law

```
T_cmd = m*g + Kp*(z_ref - z) + Ki*integral(z_ref - z) dt + Kd*(v_ref - v)
v_ref = 0
```

The feedforward term is m·g, using the same mass and gravity as the plant.
The derivative uses vertical velocity. A step change in z_ref does not kick
the derivative.

Discrete update at each sample, in this order:

1. e = z_ref − z
2. Propose I ← I + e · dt and form T_cmd.
3. If T_cmd is above T_max and e > 0, or below T_min and e < 0, discard the
   proposal and keep the previous I. This is conditional-integration
   anti-windup, not back-calculation.
4. Apply T = clamp(T_cmd, T_min, T_max) to the plant for one step.

The controller sees the true (z, v). There is no filter, delay, bias, or noise.

### Gains for the double integrator

On m·z″ = u with u = T − m·g, Ki = 0, c_d = 0, and F_ext = 0, the continuous
closed loop is

```
z / z_ref = Kp / (m s² + Kd s + Kp)
```

```
Kp = m*omega_n^2; Kd = 2*zeta*omega_n*m
```

The 2 m hover uses m = 1 kg, ω_n = 1.5 rad/s, ζ = 1, and Ki = 0, so
Kp = 2.25 N/m and Kd = 3 N·s/m. That continuous PD step response, from rest
at z = 0, is

```
z(t) = A (1 − e^(−ω t) (1 + ω t))
v(t) = A ω² t e^(−ω t)
```

with A = 2 m. The sampled controller with a zero-order hold is not this
curve. The step-response test checks that a smaller timestep reduces the
disagreement, and that at dt = 0.005 s the disagreement is under 5 mm and
5 mm/s.

### Integral gain

With F_ext = 0 and a matched feedforward, the only equilibrium is e = 0 and,
if Ki is not zero, I = 0. The proportional-derivative law already has unit DC
gain, so the milestone sets Ki = 0. The integral state is still updated by
the controller; multiplied by Ki it contributes nothing to thrust.

A nonzero Ki on the 2 m step is a different experiment. The climb error
integrates to a few metre-seconds before the vehicle reaches the reference,
and conditional integration does not freeze it, because the command is inside
the thrust limits (the first command is about 14.3 N and T_max is about
19.6 N). The leftover Ki·I is an upward force, so the vehicle stays high
while the integral unwinds. A test locks that fact: with
Ki = Kp · ω_n / 10 = 0.3375 N/(m·s), the altitude error at t = 12 s is still
greater than 0.05 m. That gain is stable, and it is the wrong gain for this
acceptance window.

With a constant F_ext and Ki = 0, the steady altitude offset is

```
z − z_ref = F_ext / Kp
```

for an upward bias. With Ki > 0 the integral trims the bias and the offset
returns to zero. A test holds the controller to that prediction.

Routh-Hurwitz on m s³ + Kd s² + Kp s + Ki = 0 requires
Ki < m · 2 · ζ · ω_n³ when Kp and Kd are the formulas above. For the nominal
Kp and Kd that upper bound is 6.75 N/(m·s).

The acceptance window starts at 8 s. That is 12 design time constants of the
PD loop, since 1/ω_n = 2/3 s. It is not an estimate fitted after looking at
a failed run.

## Milestone: 2 m hover

| Input | Value |
| --- | --- |
| Mass | 1 kg |
| Gravity | 9.80665 m/s² |
| T_min | 0 N |
| T_max | 2 · m · g = 19.6133 N |
| c_d | 0 |
| F_ext | 0 |
| z(0), v(0) | 0 m, 0 m/s, on the ground |
| z_ref | 2 m, constant |
| v_ref | 0 |
| dt | 0.01 s |
| Duration | 12 s |
| Ground contact | on |

The mass is a round number so the gain formula can be read by hand. It is
not the mass of a particular aircraft. The thrust-to-weight ratio of 2 is an
input, not a measured throttle curve.

Acceptance, applied to the trace:

- Applied thrust stays inside [T_min, T_max].
- Altitude stays at or above 0.
- From t = 8 s to the end, |z − 2 m| ≤ 0.02 m and |v| ≤ 0.05 m/s.
- The final sample meets those same error limits.

Two runs of this configuration produce the same samples.

## Assumptions

- Motion is confined to a vertical line. Attitude is level, so thrust is aligned with +z and produces no torque.
- The vehicle is a constant point mass.
- z is positive upward. With ground contact on, z = 0 is a rigid plane.
- Gravity is constant over the run.
- Thrust is an ideal bounded force, with no motor lag.
- The 2 m hover uses c_d = 0 and F_ext = 0.
- The controller is given the true state at each sample.
- v_ref is 0. The reference is not a trajectory.
- Feedforward mass and gravity match the plant.
- One fixed timestep is shared by the controller and the integrator.

## Limitations

- Not a six-degree-of-freedom model. No roll, pitch, yaw, or horizontal translation.
- No navigation and no path. The only reference is a constant altitude.
- No IMU, GPS, barometer, or estimator. A plot is the integrated state.
- Inelastic ground contact is not a landing-gear model.
- The zero-order hold makes the sampled loop differ from the continuous design.
- Gains are taken from the pole formulas, not from identification of a vehicle.
- Ki > 0 on a large step winds the integral during the climb, including when the thrust command is inside its limits. The milestone leaves Ki at 0 for that reason.
- No wind, ground effect, density change, or structural flexibility.
- Open-loop mode records zero PID terms. Those zeros were not computed by the control law.
- A sample reports 0 m/s² while the ground constraint holds the vehicle at rest. That is the vehicle acceleration, not the unbalanced force.
- The ±0.05 m/s² hold label is a teaching threshold, not a term in the equation of motion.

## Open loop

`control_mode = "open_loop"` holds one thrust command for the whole run:

```
T_cmd = open_loop_thrust_n
```

The PID is not evaluated. The sample still records proportional, integral, and
derivative terms, and those terms are zero. They are not a controller that
happens to sum to the command. The same saturation clamp is applied before
the force enters the equation of motion.

`control_mode = "pid"` is the altitude law above. Existing configs that omit
the field stay on that law.

## Acceleration on a sample

Each sample stores the vertical acceleration of the vehicle at that instant.
It is the specific force from the equation of motion, using the thrust that
will be held until the next sample. Drag and `F_ext` are included.

When ground contact is holding the vehicle at rest — `z ≤ 0`, `v ≤ 0`, and
the unbalanced acceleration is not upward — the sample reports `0 m/s²`. The
ground reaction cancels the downward net force. That reaction is not a stored
channel. A lesson that wants to see `a = T/m − g` has to start in the air.

## Teaching thresholds

Two numbers are served with the model document and are not part of the
equation of motion.

- A sampled acceleration inside ±0.05 m/s² is labeled `hold`. Above that band
  the label is `climb`. Below it, `descend`. The first sample’s label is
  `summary.initial_motion`.
- A weight answer within 0.05 N of `m·g` matches the hover-thrust summary.

The 2 m hover acceptance band is a separate check. It scores the closed-loop
hover. It does not score free fall or an arbitrary open-loop thrust.

## What this version does not do

The training center can show this vertical model, a hover lesson graded from
its samples, and the experiments the plant can actually run. It does not fly
a 6-DOF quadcopter.

Autonomous navigation, obstacle avoidance, mission planning, motor mixing,
FPV cameras, stabilized and acro modes, and sensor simulation are outside
this model. They are not approximated by placeholder outputs. Pages that
would require them say so.
