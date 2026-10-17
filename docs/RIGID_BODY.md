# FLY rigid-body model

The urban flight model is a six-degree-of-freedom rigid body. It runs in the
browser so a pilot can fly without a Python round trip. The one-dimensional
vertical model in `docs/MODEL.md` is a separate plant and remains the lab’s
source for altitude-only experiments.

This is a teaching vehicle. Mass, inertia, arm length, and thrust are round
values, not a weighed airframe.

## Frames and units

World frame: x east, y north, z up, metres. The origin is the plaza launch
point. This is not a north-east-down frame.

Body frame: x forward, y left of the nose, z up. Thrust is along body +z. The
quaternion rotates body vectors into the world. Calling +y "right" mirrored
roll on screen, so the comments now match the right-handed frame.

Right-handed body angles:

- `pitchRh > 0` lowers the nose and tips thrust toward +x.
- `rollRh > 0` lifts body +y (the left side), so the right wing goes down and thrust tips toward the right.
- Yaw is 0 with the nose east and increases toward north.

Pilot displays show nose-up pitch as `-pitchRh` and right-wing-down roll as
`+rollRh`. Heading on the panel is degrees clockwise from north.

SI units throughout: m, m/s, m/s², kg, kg·m², N, N·m, rad, rad/s, s.

## State

Position, velocity, a unit quaternion, and body angular velocity. Motor thrust
is not a state. It is computed each step and held until the next step.

## Forces and torques

Four motors in an X layout. Motor 0 is front-left, then front-right,
rear-right, and rear-left, viewed from above. Front-left and rear-right spin
one way; the other pair spins the opposite way. Reaction yaw uses
`yawTorquePerNewtonM` times thrust.

```
m*a = R(q)*[0,0,T] + [0,0,-m*g] - c_d*|v|*v
I*alpha = tau - omega × (I*omega)
```

`T` is the sum of the four motor thrusts after each motor is clamped to
`[0, T_max/4]`. Drag is quadratic and is zero at zero speed, so it does not
change the hover thrust. Inertia is diagonal. The nominal vehicle uses
`Ixx = Iyy`.

Gravity is 9.80665 m/s². Nominal mass is 0.65 kg. Maximum total thrust is
3.2 times weight. Motor radius is 0.12 m. The collision sphere radius is
0.18 m. None of these are measurements.

## Integration

Fixed timestep. Commands are zero-order held.

```
p_next = p + v*dt + 0.5*a*dt*dt
q_next = normalize(q ⊗ Exp(omega * dt))
```

Velocity and angular velocity then take one explicit Euler step with the
acceleration and angular acceleration from the start of the step. The
position update is exact while acceleration is constant. Free fall and a
level hover are constant-acceleration cases, and the tests compare them with
the closed form. The quaternion exponential map is exact for a constant
angular velocity. It is not exact once torque is changing the rate inside
the step.

Ground and building contact is applied after the step. The sphere is pushed
out of the box and the velocity into that face is removed. The contact model
is inelastic. It is not landing gear, friction, or a penalty spring.

## Controllers

Stabilized mode commands a roll angle, a pitch angle, and a yaw rate from the
sticks, then a proportional rate term produces body torque. Acro mode
commands the body rates directly and does not level the vehicle. In both
modes the throttle stick is collective thrust, from 0 to `T_max`. It is not
an altitude hold.

The landing trainer adds an outer position loop. One version steers
horizontally toward the pad and then descends. The other descends vertically
with no horizontal correction. Both call the same mixer. Neither learns, and
neither stores a value function. A run reports the position error, speeds,
and contact id from that integration.

There is no integral state in the attitude loop. The altitude PID in the
one-dimensional lab is a different controller.

## What this model does not do

It has no motor lag, battery, propeller aerodynamics, wind, or sensor noise.
Building contact does not scrape along a wall with friction. The city is a
fictional street grid, not surveyed Manhattan. A learned landing policy is
not implemented; the trainer can only run the two deterministic controllers
above.
