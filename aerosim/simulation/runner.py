"""Closed-loop stepper.

At sample k, with t_k = k * dt:

1. Read the plant state and the controller integral. Both are true model
   state. No sensor noise is added.
2. Evaluate the PID. Thrust is saturated inside that evaluation.
3. Record a sample. The recorded thrust is the value held until t_{k+1}.
4. Unless this is the final sample, integrate the plant from t_k to t_{k+1}
   with that thrust held constant, then store the integral the PID returned.

The sample clock is k * dt rather than a running sum, so the recorded time
does not drift by accumulated addition.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from aerosim.control.pid import altitude_pid
from aerosim.physics.dynamics import step_vertical
from aerosim.physics.parameters import SimulationConfig, validate_config
from aerosim.simulation.acceptance import evaluate_trace
from aerosim.simulation.state import Sample, SimulationState


@dataclass(frozen=True)
class SimulationResult:
    """A finished run: inputs, the trace, and the acceptance score."""

    config: SimulationConfig
    samples: tuple[Sample, ...]
    acceptance: dict[str, Any]

    @property
    def state_at_end(self) -> SimulationState:
        last = self.samples[-1]
        return SimulationState(
            time_s=last.time_s,
            altitude_m=last.altitude_m,
            vertical_velocity_m_s=last.vertical_velocity_m_s,
            integral_m_s=last.integral_m_s,
        )


def run_simulation(config: SimulationConfig) -> SimulationResult:
    """Integrate one closed-loop scenario and score the trace."""

    validate_config(config)
    steps = int(round(config.duration_s / config.timestep_s))
    state = SimulationState(
        time_s=0.0,
        altitude_m=config.initial_altitude_m,
        vertical_velocity_m_s=config.initial_vertical_velocity_m_s,
        integral_m_s=0.0,
    )
    samples: list[Sample] = []

    for index in range(steps + 1):
        state.time_s = index * config.timestep_s
        command = altitude_pid(
            altitude_m=state.altitude_m,
            vertical_velocity_m_s=state.vertical_velocity_m_s,
            target_altitude_m=config.target_altitude_m,
            integral_m_s=state.integral_m_s,
            timestep_s=config.timestep_s,
            mass_kg=config.mass_kg,
            gravity_m_s2=config.gravity_m_s2,
            thrust_min_n=config.thrust_min_n,
            thrust_max_n=config.thrust_max_n,
            kp_n_per_m=config.kp_n_per_m,
            ki_n_per_m_s=config.ki_n_per_m_s,
            kd_n_s_per_m=config.kd_n_s_per_m,
            velocity_reference_m_s=config.velocity_reference_m_s,
        )
        samples.append(
            Sample(
                time_s=state.time_s,
                altitude_m=state.altitude_m,
                vertical_velocity_m_s=state.vertical_velocity_m_s,
                thrust_n=command.thrust_n,
                thrust_command_n=command.thrust_command_n,
                target_altitude_m=config.target_altitude_m,
                altitude_error_m=command.altitude_error_m,
                integral_m_s=command.integral_m_s,
                feedforward_n=command.feedforward_n,
                proportional_n=command.proportional_n,
                integral_term_n=command.integral_term_n,
                derivative_n=command.derivative_n,
                saturated=command.saturated,
            )
        )
        state.integral_m_s = command.integral_m_s
        if index == steps:
            break
        altitude_m, velocity_m_s, _applied = step_vertical(
            altitude_m=state.altitude_m,
            vertical_velocity_m_s=state.vertical_velocity_m_s,
            thrust_command_n=command.thrust_n,
            timestep_s=config.timestep_s,
            mass_kg=config.mass_kg,
            gravity_m_s2=config.gravity_m_s2,
            thrust_min_n=config.thrust_min_n,
            thrust_max_n=config.thrust_max_n,
            drag_coefficient_kg_per_m=config.drag_coefficient_kg_per_m,
            external_force_n=config.external_force_n,
            ground_contact=config.ground_contact,
        )
        state.altitude_m = altitude_m
        state.vertical_velocity_m_s = velocity_m_s

    return SimulationResult(
        config=config,
        samples=tuple(samples),
        acceptance=evaluate_trace(samples, config),
    )


def summarize(result: SimulationResult) -> dict[str, float | int]:
    """Reduce a trace to scalars. Every value is taken from the samples."""

    samples = result.samples
    final = samples[-1]
    return {
        "sample_count": len(samples),
        "initial_altitude_m": samples[0].altitude_m,
        "final_time_s": final.time_s,
        "final_altitude_m": final.altitude_m,
        "final_vertical_velocity_m_s": final.vertical_velocity_m_s,
        "final_thrust_n": final.thrust_n,
        "final_altitude_error_m": final.altitude_error_m,
        "minimum_altitude_m": min(sample.altitude_m for sample in samples),
        "maximum_altitude_m": max(sample.altitude_m for sample in samples),
        "maximum_abs_vertical_velocity_m_s": max(
            abs(sample.vertical_velocity_m_s) for sample in samples
        ),
        "hover_thrust_n": result.config.mass_kg * result.config.gravity_m_s2,
    }


def main() -> None:
    """Run the 2 m hover and print the trace summary."""

    from aerosim.simulation.scenarios import hover_2m_config

    result = run_simulation(hover_2m_config())
    summary = summarize(result)
    print("AEROSIM hover_2m")
    for key, value in summary.items():
        print(f"{key}: {value}")
    print(f"acceptance_passed: {result.acceptance['passed']}")
    for item in result.acceptance["criteria"]:
        print(
            f"  {item['name']}: observed={item['observed']} "
            f"limit={item['limit']} {item['unit']} passed={item['passed']}"
        )


if __name__ == "__main__":
    main()
