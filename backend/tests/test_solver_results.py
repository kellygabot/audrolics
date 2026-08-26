from dataclasses import FrozenInstanceError

import pytest

from backend.engine.inputs import build_physics_input
from backend.engine.solver import (
    LinkHydraulicResult,
    NodeHydraulicResult,
    SolverDiagnostics,
    SolverError,
    SolverResult,
    SolverWarning,
    solve_network,
)
from backend.schemas.schematic import SchematicCreate


def test_solver_result_groups_node_link_results_and_diagnostics() -> None:
    node = NodeHydraulicResult(
        node_id="junction-1",
        label="J-1",
        node_type="JUNCTION",
        hydraulic_head_m=27.5,
        pressure_head_m=24.5,
        actual_demand_lps=2.5,
    )
    link = LinkHydraulicResult(
        link_id="pipe-1",
        label="P-1",
        link_type="PIPE",
        flow_lps=2.5,
        velocity_mps=0.14,
        headloss_m=0.2,
        unit_headloss_m_per_m=0.002,
    )
    diagnostics = SolverDiagnostics(
        iterations=6,
        max_node_imbalance_lps=0.0005,
        max_link_imbalance_m=0.0007,
        head_correction_l2_m=0.0009,
        converged=True,
    )

    result = SolverResult(
        status="CONVERGED",
        node_results={node.node_id: node},
        link_results={link.link_id: link},
        diagnostics=diagnostics,
        warnings=(SolverWarning(code="E100", message="Operating point was near a tolerance boundary"),),
    )

    assert result.node_results["junction-1"].pressure_head_m == 24.5
    assert result.link_results["pipe-1"].flow_lps == 2.5
    assert result.diagnostics.converged is True
    assert result.warnings[0].code == "E100"


def test_solver_result_can_describe_failed_runs_without_partial_values() -> None:
    result = SolverResult(
        status="FAILED",
        errors=(
            SolverError(
                code="E101",
                message="Network has no reservoir or tank source",
                attribute="nodes",
            ),
        ),
    )

    assert result.node_results == {}
    assert result.link_results == {}
    assert result.diagnostics.iterations == 0
    assert result.errors[0].code == "E101"


def test_solver_result_dataclasses_are_frozen() -> None:
    node = NodeHydraulicResult(node_id="junction-1", label="J-1", node_type="JUNCTION")

    with pytest.raises(FrozenInstanceError):
        node.pressure_head_m = 10


def test_solve_network_is_explicitly_not_implemented_yet() -> None:
    schematic = SchematicCreate.model_validate(
        {
            "name": "Tiny network",
            "nodes": [
                {
                    "id": "reservoir-1",
                    "label": "R-1",
                    "type": "RESERVOIR",
                    "x": 0,
                    "y": 0,
                    "input_params": {"total_head": 30},
                },
                {
                    "id": "junction-1",
                    "label": "J-1",
                    "type": "JUNCTION",
                    "x": 100,
                    "y": 0,
                    "input_params": {"elevation": 0, "base_demand": 1},
                },
            ],
            "links": [
                {
                    "id": "pipe-1",
                    "label": "P-1",
                    "type": "PIPE",
                    "from_node_id": "reservoir-1",
                    "to_node_id": "junction-1",
                    "input_params": {"length": 100, "diameter": 150},
                }
            ],
        }
    )

    result = solve_network(build_physics_input(schematic))

    assert result.status == "FAILED"
    assert result.errors[0].code == "E100"
    assert result.errors[0].message == "Hydraulic solver is not implemented yet."
