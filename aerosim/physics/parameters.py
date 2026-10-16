"""Validated parameters of one closed-loop run.

Every quantity is a model input. Nothing here is a sensor reading.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class SimulationConfig:
    """Inputs of the 1D vertical simulation.

    Units are in the field names. See docs/MODEL.md for the equations that
    consume these values.
    """

    mass_kg: float
    gravity_m_s2: float
    thrust_min_n: float
    thrust_max_n: float
    drag_coefficient_kg_per_m: float
    external_force_n: float
    initial_altitude_m: float
    initial_vertical_velocity_m_s: float
    target_altitude_m: float
    kp_n_per_m: float
    ki_n_per_m_s: float
    kd_n_s_per_m: float
    timestep_s: float
    duration_s: float
    ground_contact: bool
    velocity_reference_m_s: float = 0.0
    natural_frequency_rad_s: float | None = None
    damping_ratio: float | None = None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def validate_config(config: SimulationConfig) -> None:
    """Raise ValueError if a parameter cannot be used in the equations."""

    _positive("mass_kg", config.mass_kg)
    _positive("gravity_m_s2", config.gravity_m_s2)
    _finite("thrust_min_n", config.thrust_min_n)
    _finite("thrust_max_n", config.thrust_max_n)
    if config.thrust_min_n < 0.0:
        raise ValueError("thrust_min_n must be >= 0 N. This model has no negative thrust.")
    if config.thrust_max_n < config.thrust_min_n:
        raise ValueError("thrust_max_n must be >= thrust_min_n")
    _non_negative("drag_coefficient_kg_per_m", config.drag_coefficient_kg_per_m)
    _finite("external_force_n", config.external_force_n)
    _finite("initial_altitude_m", config.initial_altitude_m)
    _finite("initial_vertical_velocity_m_s", config.initial_vertical_velocity_m_s)
    _finite("target_altitude_m", config.target_altitude_m)
    _non_negative("kp_n_per_m", config.kp_n_per_m)
    _non_negative("ki_n_per_m_s", config.ki_n_per_m_s)
    _non_negative("kd_n_s_per_m", config.kd_n_s_per_m)
    _positive("timestep_s", config.timestep_s)
    _positive("duration_s", config.duration_s)
    _finite("velocity_reference_m_s", config.velocity_reference_m_s)
    if config.ground_contact and config.initial_altitude_m < 0.0:
        raise ValueError("initial_altitude_m must be >= 0 m when ground contact is enabled")

    steps = int(round(config.duration_s / config.timestep_s))
    if steps < 1:
        raise ValueError("duration_s must span at least one timestep")
    if steps > 20_000:
        raise ValueError("duration_s / timestep_s must be <= 20000 samples")
    if abs(steps * config.timestep_s - config.duration_s) > 1e-9 * max(1.0, config.duration_s):
        raise ValueError("duration_s must be an integer number of timesteps")

    for name, value in (
        ("natural_frequency_rad_s", config.natural_frequency_rad_s),
        ("damping_ratio", config.damping_ratio),
    ):
        if value is not None:
            _finite(name, value)
            if value < 0.0:
                raise ValueError(f"{name} must be >= 0 when provided")


def _finite(name: str, value: float) -> None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"{name} must be a finite number")
    if value != value or value in (float("inf"), float("-inf")):
        raise ValueError(f"{name} must be finite")


def _positive(name: str, value: float) -> None:
    _finite(name, value)
    if value <= 0.0:
        raise ValueError(f"{name} must be > 0")


def _non_negative(name: str, value: float) -> None:
    _finite(name, value)
    if value < 0.0:
        raise ValueError(f"{name} must be >= 0")
