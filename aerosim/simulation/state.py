"""Simulation state and the immutable record of one sample.

SimulationState is the memory the stepper updates: plant state (altitude,
vertical velocity), controller memory (integral of altitude error), and the
clock. Sample is a frozen copy of what was computed at one sample instant,
including the thrust that the zero-order hold will apply until the next
sample. Samples are outputs of the integrator and the controller. They are
not measurements from a sensor model.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass
class SimulationState:
    """Mutable working memory for a single closed-loop run."""

    time_s: float
    altitude_m: float
    vertical_velocity_m_s: float
    integral_m_s: float


@dataclass(frozen=True)
class Sample:
    """One recorded output of the closed-loop stepper."""

    time_s: float
    altitude_m: float
    vertical_velocity_m_s: float
    thrust_n: float
    thrust_command_n: float
    target_altitude_m: float
    altitude_error_m: float
    integral_m_s: float
    feedforward_n: float
    proportional_n: float
    integral_term_n: float
    derivative_n: float
    saturated: bool

    def to_dict(self) -> dict[str, float | bool]:
        return asdict(self)
