"""Altitude control. This package does not integrate the plant."""

from aerosim.control.pid import PidOutput, altitude_pd_gains, altitude_pid

__all__ = ["PidOutput", "altitude_pd_gains", "altitude_pid"]
