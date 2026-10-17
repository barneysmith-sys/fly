"""AEROSIM: educational quadcopter flight dynamics.

Version 0.1 models only vertical translation. It does not navigate, estimate
state, or simulate sensors.
"""

from aerosim.simulation.runner import run_simulation
from aerosim.simulation.scenarios import hover_2m_config

__version__ = "0.1.0"

__all__ = ["__version__", "hover_2m_config", "run_simulation"]
