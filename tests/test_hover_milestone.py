"""The 2 m hover milestone: one config, one reproducible trace."""

from __future__ import annotations

from aerosim.simulation.acceptance import ALTITUDE_TOLERANCE_M, SETTLE_TIME_S
from aerosim.simulation.runner import run_simulation
from aerosim.simulation.scenarios import HOVER_ALTITUDE_M, hover_2m_config


def test_two_metre_hover_meets_the_acceptance_band() -> None:
    result = run_simulation(hover_2m_config())
    assert result.acceptance["passed"] is True
    assert result.samples[0].altitude_m == 0.0
    assert result.samples[0].vertical_velocity_m_s == 0.0
    final = result.samples[-1]
    assert result.config.ki_n_per_m_s == 0.0
    assert abs(final.altitude_m - HOVER_ALTITUDE_M) < 1e-3
    assert abs(final.vertical_velocity_m_s) < 1e-3
    settled = [sample for sample in result.samples if sample.time_s >= SETTLE_TIME_S]
    assert settled
    assert min(sample.altitude_m for sample in result.samples) >= 0.0


def test_two_runs_produce_the_same_trace() -> None:
    first = run_simulation(hover_2m_config())
    second = run_simulation(hover_2m_config())
    assert first.samples == second.samples
