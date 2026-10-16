# AEROSIM

Educational quadcopter flight dynamics. This repository is FLY. AEROSIM is the
simulator, and version 0.1 is its first milestone: a vertical point-mass model
and a reproducible 2 m hover.

The plant, the PID, the simulation state, and the dashboard are separate.
The dashboard draws the trace the Python model returns. It does not invent
telemetry, and it does not integrate a second copy of the physics.

## What is modeled

A point mass on a vertical line, thrust positive upward, gravity downward,
optional quadratic drag, and a thrust limit. A PID with gravity feedforward
holds a constant altitude. The shipped scenario starts at rest on the ground
and is commanded to 2 m. Its integral gain is zero: the feedforward term
already balances weight, and a nonzero integral on this step is still high at
12 s. The integral term is implemented and is checked against a constant
external force.

The equations, assumptions, and limitations are in [docs/MODEL.md](docs/MODEL.md).
A plain-language guide to the units is in [docs/UNITS.md](docs/UNITS.md).

## What is not modeled

Attitude, horizontal motion, motor dynamics, wind, sensors, estimators, and
navigation. None of those appear as simulated channels.

## Layout

```
aerosim/physics       forces, RK4, parameter checks
aerosim/control       PID altitude law and the gain formulas
aerosim/simulation    state, closed-loop runner, 2 m scenario
aerosim/api           HTTP access to a run
frontend              React dashboard
tests                 free fall, hover, step response, saturation, milestone
```

## Run the tests

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/pytest
```

The free-fall and hover tests compare the integrator with the closed-form
constant-acceleration solution. The step-response test compares a PD loop
with the critically damped continuous solution and checks that the error
falls when the timestep is reduced.

## Run the 2 m hover

```bash
.venv/bin/python -m aerosim
```

That prints the summary of one integration. It does not start the dashboard.

## Dashboard

Terminal A:

```bash
.venv/bin/python -m aerosim.api.server
```

Terminal B:

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints. The page loads `GET /api/scenarios/hover-2m`, which
runs the model, then plots that response. Parameter edits are sent to
`POST /api/simulate` and the next plot is the new trace. If the API is down,
the page reports the error and leaves the readouts empty.

## Milestone

The 2 m hover passes when, from t = 8 s onward, altitude stays within 0.02 m
of 2 m and vertical speed stays within 0.05 m/s, thrust stays inside its
bounds, and the vehicle never goes below the ground. The acceptance block on
the dashboard is that check, scored by the Python run.
