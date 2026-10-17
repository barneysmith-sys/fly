# Units in AEROSIM

The numbers on the dashboard are in the units of the equations. This page
says what those units are, and which other units show up in aviation and in
hobby multirotor specs.

Flight dynamics and autopilot code keep the equations in SI units: metres, seconds, kilograms, and newtons. AEROSIM follows that convention.

Pilot-facing displays often use feet, knots, and feet per minute. Those units belong to operations, not to this equation set.

Positive altitude and positive vertical velocity are upward. Many aircraft textbooks use a north-east-down frame, where down is positive. This model does not.

## Quantities on the hover display

### Altitude, z, in m

Metres above this model's ground, positive upward. 2 m is about the height of a doorway. Pilot displays often show feet instead; 1 m is about 3.28 ft.

The origin is the ground plane of the simulation. It is not mean sea level, and it is not a barometric altitude.

### Vertical velocity, v, in m/s

How fast altitude is changing, in metres per second. Positive is climbing. 1 m/s is a slow walk upward, and the hover target is 0 m/s. Knots are a horizontal airspeed unit and are not used here.

A knot is one nautical mile per hour, about 0.514 m/s, and it is the usual way to state an airplane's airspeed. Climb and descent in the cockpit are often feet per minute. Neither appears in this model.

### Thrust and weight, T, in N

Newtons of force. One newton accelerates 1 kg at 1 m/s². The weight of the 1 kg vehicle is 9.80665 N. Hobby charts that say grams of thrust mean the mass that force could hover: 1000 g of thrust is about 9.81 N, not 1000 N.

At the settled hover the thrust returns to the weight, because the vehicle is not accelerating. The thrust-to-weight ratio T_max / (m·g) is dimensionless. The shipped vehicle uses 2, so the greatest upward acceleration is about one g.

### Mass, m, in kg

Kilograms of matter. Mass is not weight. Weight is the downward force m·g, in newtons. The nominal vehicle is 1 kg, chosen so the gain formulas stay readable.

## The rest of the inputs

### Acceleration, a, in m/s²

How quickly vertical velocity changes. With zero thrust the acceleration is −9.80665 m/s², one standard gravity downward. People also call that 1 g. Here g is an acceleration, not a gram.

### Time, t, in s

Seconds from the start of the run. The playhead follows this simulation clock. Playback at 1× spends one wall-clock second per simulation second.

### Timestep, Δt, in s

The shared step of the controller and the integrator. 0.01 s is 10 milliseconds, so the run takes 100 steps for each second of simulation time.

### Drag coefficient, c_d, in kg/m

The lumped number in the drag force −c_d·|v|·v. It is not the dimensionless aerodynamic coefficient C_D. The 2 m hover sets c_d to 0.

### Proportional gain, Kp, in N/m

Extra newtons of thrust for each metre of altitude error. Kp = 2.25 N/m means a vehicle sitting 1 m below the target is commanded 2.25 N above hover thrust, before the other terms.

### Integral gain, Ki, in N/(m·s)

The integral of altitude error is in metre-seconds. Ki converts that accumulation into newtons. Ki = 0 means the accumulated error does not change the thrust.

### Derivative gain, Kd, in N·s/m

Newtons of thrust for each metre per second of vertical-velocity error. With the velocity reference at 0, climbing produces a negative contribution and reduces thrust. The same unit is a damping coefficient, kg/s.

### Natural frequency, ω_n, in rad/s

The designed speed of the response, in radians per second, not propeller RPM. 1.5 rad/s would have a period of about 4.2 s if the motion were a sustained oscillation. This hover design is critically damped, so it does not oscillate.

### Damping ratio, ζ, dimensionless

A dimensionless description of the proportional-derivative design. 1 is critical damping. Above 1 the linear response is slower and still does not oscillate. Below 1 it overshoots.

### External force, F_ext, in N

A constant force added in the equation of motion, positive upward. It is an input used to test the integral term. It is not a wind measurement.
