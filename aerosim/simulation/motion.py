"""Teaching labels for a vertical acceleration.

The band is not a physical constant and it does not change the integrator.
An acceleration inside ±0.05 m/s² is labeled a hold so a lesson can grade a
prediction against a sample. 0.05 m/s² is about 0.005 times standard gravity.
"""

from __future__ import annotations

HOLD_ACCELERATION_BAND_M_S2 = 0.05
WEIGHT_CHECK_TOLERANCE_N = 0.05


def classify_vertical_motion(acceleration_m_s2: float) -> str:
    """Return climb, hold, or descend from one vertical acceleration."""

    if acceleration_m_s2 > HOLD_ACCELERATION_BAND_M_S2:
        return "climb"
    if acceleration_m_s2 < -HOLD_ACCELERATION_BAND_M_S2:
        return "descend"
    return "hold"
