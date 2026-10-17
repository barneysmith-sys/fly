"""Catalog experiments run the plant and score the trace they produce."""

from __future__ import annotations

from aerosim.simulation.experiments import experiment_by_id, list_experiments, run_experiment


def test_catalog_ids_are_unique() -> None:
    ids = [item.experiment_id for item in list_experiments()]
    assert ids == [
        "free-fall",
        "hover-equilibrium",
        "step-response",
        "thrust-saturation",
        "pid-overshoot",
        "integral-residual",
        "disturbance-recovery",
    ]
    assert len(ids) == len(set(ids))


def test_every_catalog_experiment_passes_its_own_checks() -> None:
    for experiment in list_experiments():
        _result, report = run_experiment(experiment)
        failed = [item["name"] for item in report["findings"] if not item["passed"]]
        assert report["passed"] is True, f"{experiment.experiment_id} failed {failed}"


def test_unknown_experiment_is_absent() -> None:
    assert experiment_by_id("waypoint-mission") is None
