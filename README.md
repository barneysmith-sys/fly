# FLY

Educational drone-engineering software. The flight model is AEROSIM. Version
0.2 keeps the verified vertical point-mass plant and adds a training-center
shell around it.

The plant, the PID, open-loop thrust, the simulation state, and the interface
are separate. Every altitude, velocity, acceleration, and thrust on screen
comes from a Python trace. The page does not integrate a second copy of the
physics.

## What is modeled

A point mass on a vertical line, thrust positive upward, gravity downward,
optional quadratic drag, and a thrust limit. Two command paths exist:

- PID altitude hold with gravity feedforward. The shipped scenario starts at
  rest on the ground and is commanded to 2 m. Its integral gain is zero.
- Open-loop constant thrust. The PID terms in those samples are zero because
  the PID was not evaluated.

The equations, the open-loop path, the acceleration reported on each sample,
and the teaching thresholds are in [docs/MODEL.md](docs/MODEL.md). A
plain-language units guide is in [docs/UNITS.md](docs/UNITS.md).

## Training center

The interface has six sections.

| Section | What works in this version |
| --- | --- |
| Flight | Replays the 2 m hover. The camera shows altitude only. |
| Learn | One lesson, “Why a hover holds.” The prediction is checked against the returned trace. |
| Lab | Mass, gravity, and constant thrust, plus the experiments the 1D plant can run. |
| Autonomy | The PID pipeline, labeled as classical control. |
| Systems | Component descriptions. None of those parts are in the integrator. |
| Progress | Beginner, then Flight Fundamentals after the hover lesson matches. |

FPV cameras, stabilized and acro modes, keyboard rate commands, 6-DOF motion,
sensor noise, wind, and learned controllers are not implemented. Those
sections say “Coming in a future milestone” instead of imitating them.

## What is not modeled

Attitude, horizontal motion, motor dynamics, wind, sensors, estimators, and
navigation. None of those appear as simulated channels.

## Layout

```
aerosim/physics       forces, RK4, parameter checks
aerosim/control       PID altitude law, gain formulas, constant thrust
aerosim/simulation    state, runner, 2 m scenario, experiments
aerosim/api           HTTP access to a run and to the experiment catalog
frontend              Training center
tests                 free fall, hover, step response, saturation, open loop
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
falls when the timestep is reduced. The experiment catalog runs each named
case and checks that case’s own findings.

## Run the 2 m hover

```bash
.venv/bin/python -m aerosim
```

That prints the summary of one integration. It does not start the interface.

## Training center

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

Open the URL Vite prints. Flight loads `GET /api/scenarios/hover-2m`. The lab
and the hover lesson send configs to `POST /api/simulate`. Named experiments
are `GET /api/experiments` and `GET /api/experiments/{id}`. If the API is
down, the page reports the error and leaves the readouts empty.

GitHub Pages cannot run this Python model. A static host will not produce a
trace.

## Milestone

The 2 m hover passes when, from t = 8 s onward, altitude stays within 0.02 m
of 2 m and vertical speed stays within 0.05 m/s, thrust stays inside its
bounds, and the vehicle never goes below the ground. That band scores the
hover. It does not score free fall or an arbitrary thrust.

The next physics milestone is a documented 6-DOF quadcopter. Until that
exists, FLY does not offer FPV flight.
