"""Reproducible vertical experiments the 1D model can actually run.

Each experiment is a SimulationConfig plus checks against its trace. Wind,
sensor noise, and motor-by-motor mixing are not offered here, because this
plant does not contain them.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from aerosim.control.pid import altitude_pd_gains
from aerosim.physics.constants import STANDARD_GRAVITY_M_S2
from aerosim.physics.parameters import SimulationConfig
from aerosim.simulation.runner import SimulationResult, run_simulation
from aerosim.simulation.scenarios import (
    DAMPING_RATIO,
    NATURAL_FREQUENCY_RAD_S,
    NOMINAL_MASS_KG,
    THRUST_TO_WEIGHT,
    hover_2m_config,
)

G = STANDARD_GRAVITY_M_S2


@dataclass(frozen=True)
class Experiment:
    """One named run and the question it is meant to answer."""

    experiment_id: str
    title: str
    summary: str
    supports: str
    inputs: tuple[str, ...]
    config: SimulationConfig


def list_experiments() -> tuple[Experiment, ...]:
    """Return the catalog in teaching order. Nothing is executed."""

    weight_n = NOMINAL_MASS_KG * G
    thrust_max_n = THRUST_TO_WEIGHT * weight_n
    kp_n_per_m, kd_n_s_per_m = altitude_pd_gains(
        NOMINAL_MASS_KG, NATURAL_FREQUENCY_RAD_S, DAMPING_RATIO
    )
    underdamped_kp, underdamped_kd = altitude_pd_gains(NOMINAL_MASS_KG, NATURAL_FREQUENCY_RAD_S, 0.3)
    return (
        Experiment(
            experiment_id="free-fall",
            title="Free fall",
            summary=(
                "Thrust is held at 0 N from rest at 2 m. The run ends at 0.60 s, "
                "before the vehicle reaches the ground. With drag and external force "
                "at zero, every sample should accelerate at −g."
            ),
            supports="Constant thrust, gravity, and RK4 on an airborne point mass.",
            inputs=(
                "mass = 1 kg",
                "thrust command = 0 N, held constant",
                "initial altitude = 2 m, initial velocity = 0 m/s",
                "duration = 0.60 s, timestep = 0.01 s",
                "drag = 0, external force = 0",
            ),
            config=_open_loop(
                thrust_n=0.0,
                initial_altitude_m=2.0,
                duration_s=0.60,
                thrust_max_n=thrust_max_n,
            ),
        ),
        Experiment(
            experiment_id="hover-equilibrium",
            title="Hover equilibrium",
            summary=(
                "Thrust is held equal to weight, from rest at 2 m, for 4 s. "
                "Acceleration is zero, so altitude stays at 2 m."
            ),
            supports="Newton's second law at T = m·g and v = 0.",
            inputs=(
                "mass = 1 kg",
                f"thrust command = m·g = {weight_n:.5f} N, held constant",
                "initial altitude = 2 m, initial velocity = 0 m/s",
                "duration = 4 s",
            ),
            config=_open_loop(
                thrust_n=weight_n,
                initial_altitude_m=2.0,
                duration_s=4.0,
                thrust_max_n=thrust_max_n,
            ),
        ),
        Experiment(
            experiment_id="step-response",
            title="Vertical step response",
            summary=(
                "The closed-loop 2 m hover. A PID with gravity feedforward and Ki = 0 "
                "climbs from rest on the ground to a constant 2 m reference. "
                "The hover acceptance band is the score for this run only."
            ),
            supports="Matched PD altitude loop on the double integrator.",
            inputs=(
                "mass = 1 kg",
                "target altitude = 2 m",
                "Kp = 2.25 N/m, Ki = 0, Kd = 3 N·s/m",
                "starts at rest on the ground",
                "duration = 12 s",
            ),
            config=hover_2m_config(),
        ),
        Experiment(
            experiment_id="thrust-saturation",
            title="Thrust saturation",
            summary=(
                "The command is 100 N. The plant cannot apply more than 2·m·g. "
                "The first sample should show a saturated command and an acceleration "
                "computed from the limited thrust, which is +g for this thrust-to-weight ratio."
            ),
            supports="The thrust clamp in front of the equation of motion.",
            inputs=(
                "thrust command = 100 N",
                f"thrust max = {thrust_max_n:.4f} N",
                "initial altitude = 2 m",
                "duration = 0.50 s",
            ),
            config=_open_loop(
                thrust_n=100.0,
                initial_altitude_m=2.0,
                duration_s=0.50,
                thrust_max_n=thrust_max_n,
            ),
        ),
        Experiment(
            experiment_id="pid-overshoot",
            title="PID overshoot",
            summary=(
                "Same altitude step as the 2 m hover, but the damping ratio is 0.3 "
                "instead of 1. Ki stays 0. The underdamped proportional-derivative "
                "loop climbs past the reference and then returns. This is oscillatory "
                "overshoot, not the integral residual."
            ),
            supports="The PD gain formulas with ζ < 1 on this plant.",
            inputs=(
                "target altitude = 2 m, from rest on the ground",
                "ω_n = 1.5 rad/s, ζ = 0.3, Ki = 0",
                f"Kp = {underdamped_kp:.4f} N/m, Kd = {underdamped_kd:.4f} N·s/m",
                "duration = 12 s",
            ),
            config=_pid(
                kp_n_per_m=underdamped_kp,
                ki_n_per_m_s=0.0,
                kd_n_s_per_m=underdamped_kd,
                initial_altitude_m=0.0,
                target_altitude_m=2.0,
                duration_s=12.0,
                thrust_max_n=thrust_max_n,
                damping_ratio=0.3,
            ),
        ),
        Experiment(
            experiment_id="integral-residual",
            title="Integral residual",
            summary=(
                "Ki = Kp·ω_n/10 on the 2 m step. Thrust stays inside its limits, "
                "so anti-windup does not freeze the integral. At 12 s the vehicle "
                "is still above 2 m. That is a residual from integrated climb error, "
                "not an underdamped overshoot."
            ),
            supports="Conditional-integration PID with a nonzero Ki on a large step.",
            inputs=(
                "Kp = 2.25 N/m, Kd = 3 N·s/m",
                "Ki = 0.3375 N/(m·s)",
                "target = 2 m from the ground",
                "duration = 12 s",
            ),
            config=_pid(
                kp_n_per_m=kp_n_per_m,
                ki_n_per_m_s=kp_n_per_m * NATURAL_FREQUENCY_RAD_S / 10.0,
                kd_n_s_per_m=kd_n_s_per_m,
                initial_altitude_m=0.0,
                target_altitude_m=2.0,
                duration_s=12.0,
                thrust_max_n=thrust_max_n,
                damping_ratio=DAMPING_RATIO,
            ),
        ),
        Experiment(
            experiment_id="disturbance-recovery",
            title="Disturbance recovery",
            summary=(
                "A constant 0.5 N upward force acts for the whole run. Ki = 0.8 "
                "trims it. The vehicle starts at the 2 m reference and should be "
                "back within 0.02 m at 40 s. The force is an equation input, not a wind measurement."
            ),
            supports="Integral action against a constant F_ext. No wind model.",
            inputs=(
                "F_ext = 0.5 N upward, constant",
                "Ki = 0.8 N/(m·s), Kp = 2.25 N/m, Kd = 3 N·s/m",
                "initial altitude = target = 2 m",
                "duration = 40 s",
            ),
            config=_pid(
                kp_n_per_m=kp_n_per_m,
                ki_n_per_m_s=0.8,
                kd_n_s_per_m=kd_n_s_per_m,
                initial_altitude_m=2.0,
                target_altitude_m=2.0,
                duration_s=40.0,
                thrust_max_n=30.0,
                external_force_n=0.5,
                damping_ratio=DAMPING_RATIO,
                ground_contact=False,
            ),
        ),
    )


def experiment_by_id(experiment_id: str) -> Experiment | None:
    for experiment in list_experiments():
        if experiment.experiment_id == experiment_id:
            return experiment
    return None


def experiment_summary(experiment: Experiment) -> dict[str, Any]:
    """Catalog entry. The model is not run."""

    return {
        "experiment_id": experiment.experiment_id,
        "title": experiment.title,
        "summary": experiment.summary,
        "supports": experiment.supports,
        "inputs": list(experiment.inputs),
        "scores_hover_band": experiment.experiment_id == "step-response",
    }


def run_experiment(experiment: Experiment) -> tuple[SimulationResult, dict[str, Any]]:
    """Integrate one catalog entry and score it with that entry's checks."""

    result = run_simulation(experiment.config)
    findings = _findings(experiment.experiment_id, result)
    report = {
        **experiment_summary(experiment),
        "passed": all(item["passed"] for item in findings),
        "findings": findings,
    }
    return result, report


def _open_loop(
    *,
    thrust_n: float,
    initial_altitude_m: float,
    duration_s: float,
    thrust_max_n: float,
) -> SimulationConfig:
    return SimulationConfig(
        mass_kg=NOMINAL_MASS_KG,
        gravity_m_s2=G,
        thrust_min_n=0.0,
        thrust_max_n=thrust_max_n,
        drag_coefficient_kg_per_m=0.0,
        external_force_n=0.0,
        initial_altitude_m=initial_altitude_m,
        initial_vertical_velocity_m_s=0.0,
        target_altitude_m=initial_altitude_m,
        kp_n_per_m=0.0,
        ki_n_per_m_s=0.0,
        kd_n_s_per_m=0.0,
        timestep_s=0.01,
        duration_s=duration_s,
        ground_contact=True,
        control_mode="open_loop",
        open_loop_thrust_n=thrust_n,
    )


def _pid(
    *,
    kp_n_per_m: float,
    ki_n_per_m_s: float,
    kd_n_s_per_m: float,
    initial_altitude_m: float,
    target_altitude_m: float,
    duration_s: float,
    thrust_max_n: float,
    damping_ratio: float,
    external_force_n: float = 0.0,
    ground_contact: bool = True,
) -> SimulationConfig:
    return SimulationConfig(
        mass_kg=NOMINAL_MASS_KG,
        gravity_m_s2=G,
        thrust_min_n=0.0,
        thrust_max_n=thrust_max_n,
        drag_coefficient_kg_per_m=0.0,
        external_force_n=external_force_n,
        initial_altitude_m=initial_altitude_m,
        initial_vertical_velocity_m_s=0.0,
        target_altitude_m=target_altitude_m,
        kp_n_per_m=kp_n_per_m,
        ki_n_per_m_s=ki_n_per_m_s,
        kd_n_s_per_m=kd_n_s_per_m,
        timestep_s=0.01,
        duration_s=duration_s,
        ground_contact=ground_contact,
        natural_frequency_rad_s=NATURAL_FREQUENCY_RAD_S,
        damping_ratio=damping_ratio,
        control_mode="pid",
    )


def _findings(experiment_id: str, result: SimulationResult) -> list[dict[str, Any]]:
    samples = result.samples
    first = samples[0]
    final = samples[-1]
    config = result.config
    if experiment_id == "free-fall":
        accel_error = max(abs(sample.vertical_acceleration_m_s2 - (-G)) for sample in samples)
        expected_z = 2.0 - 0.5 * G * final.time_s * final.time_s
        return [
            _near(
                "acceleration",
                "Every sample accelerates at −g.",
                accel_error,
                0.0,
                1e-9,
                "m/s²",
            ),
            _near(
                "final_altitude",
                "Final altitude matches the constant-acceleration solution.",
                final.altitude_m,
                expected_z,
                1e-9,
                "m",
            ),
            _above(
                "still_airborne",
                "The vehicle is still above the ground at the end of the run.",
                min(sample.altitude_m for sample in samples),
                0.0,
                "m",
            ),
        ]
    if experiment_id == "hover-equilibrium":
        return [
            _near(
                "altitude",
                "Altitude stays at 2 m.",
                max(abs(sample.altitude_m - 2.0) for sample in samples),
                0.0,
                1e-9,
                "m",
            ),
            _near(
                "velocity",
                "Vertical velocity stays at 0.",
                max(abs(sample.vertical_velocity_m_s) for sample in samples),
                0.0,
                1e-9,
                "m/s",
            ),
            _near(
                "acceleration",
                "Acceleration stays at 0.",
                max(abs(sample.vertical_acceleration_m_s2) for sample in samples),
                0.0,
                1e-9,
                "m/s²",
            ),
            _near(
                "thrust",
                "Applied thrust equals weight.",
                first.thrust_n,
                config.mass_kg * config.gravity_m_s2,
                1e-9,
                "N",
            ),
        ]
    if experiment_id == "step-response":
        return [_from_acceptance(item) for item in result.acceptance["criteria"]]
    if experiment_id == "thrust-saturation":
        limited = config.thrust_max_n / config.mass_kg - config.gravity_m_s2
        return [
            _above(
                "command_above_limit",
                "The thrust command is above T_max.",
                first.thrust_command_n - config.thrust_max_n,
                0.0,
                "N",
            ),
            _near(
                "applied_thrust",
                "Applied thrust equals T_max.",
                first.thrust_n,
                config.thrust_max_n,
                1e-9,
                "N",
            ),
            _near(
                "acceleration_uses_the_limit",
                "Initial acceleration uses the limited thrust, which is +g here.",
                first.vertical_acceleration_m_s2,
                limited,
                1e-9,
                "m/s²",
            ),
        ]
    if experiment_id == "pid-overshoot":
        peak = max(sample.altitude_m for sample in samples)
        return [
            _above(
                "climbs_past_target",
                "Altitude rises more than 0.05 m above the 2 m reference.",
                peak - config.target_altitude_m,
                0.05,
                "m",
            ),
            _near(
                "returns_near_target",
                "By 12 s the altitude is back within 0.05 m of the reference.",
                final.altitude_m,
                config.target_altitude_m,
                0.05,
                "m",
            ),
        ]
    if experiment_id == "integral-residual":
        saturated = 1.0 if any(sample.saturated for sample in samples) else 0.0
        return [
            _above(
                "still_high",
                "At 12 s the altitude is still more than 0.05 m above the reference.",
                final.altitude_m - config.target_altitude_m,
                0.05,
                "m",
            ),
            _near(
                "unsaturated",
                "Thrust does not saturate. 0 means no saturated sample.",
                saturated,
                0.0,
                0.0,
                "1",
            ),
        ]
    if experiment_id == "disturbance-recovery":
        return [
            _near(
                "final_altitude",
                "Final altitude is within 0.02 m of 2 m.",
                final.altitude_m,
                config.target_altitude_m,
                0.02,
                "m",
            ),
            _near(
                "final_velocity",
                "Final vertical velocity is within 0.02 m/s of zero.",
                final.vertical_velocity_m_s,
                0.0,
                0.02,
                "m/s",
            ),
        ]
    raise ValueError(f"no checks for {experiment_id}")


def _near(
    name: str,
    description: str,
    observed: float,
    expected: float,
    tolerance: float,
    unit: str,
) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "observed": observed,
        "expected": expected,
        "tolerance": tolerance,
        "unit": unit,
        "passed": abs(observed - expected) <= tolerance,
    }


def _above(
    name: str,
    description: str,
    observed: float,
    expected: float,
    unit: str,
) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "observed": observed,
        "expected": expected,
        "tolerance": None,
        "unit": unit,
        "passed": observed > expected,
    }


def _from_acceptance(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": item["name"],
        "description": item["description"],
        "observed": item["observed"],
        "expected": item["limit"],
        "tolerance": 0.0,
        "unit": item["unit"],
        "passed": item["passed"],
    }
