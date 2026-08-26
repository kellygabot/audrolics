import pytest

from backend.engine.inputs import PhysicsInputBuildError, build_physics_input
from backend.schemas.schematic import SchematicCreate


def physics_ready_payload() -> dict:
    return {
        "name": "Physics input fixture",
        "nodes": [
            {
                "id": "junction-1",
                "label": "J-1",
                "type": "JUNCTION",
                "x": 10,
                "y": 20,
                "input_params": {"elevation": 3, "base_demand": 2.5, "demand_pattern": "future-eps"},
            },
            {
                "id": "reservoir-1",
                "label": "R-1",
                "type": "RESERVOIR",
                "x": 0,
                "y": 20,
                "input_params": {"total_head": 35},
            },
            {
                "id": "tank-1",
                "label": "T-1",
                "type": "TANK",
                "x": 100,
                "y": 20,
                "input_params": {"elevation": 4, "diameter": 7, "min_level": 1, "max_level": 5, "initial_level": 3},
            },
        ],
        "links": [
            {
                "id": "pipe-1",
                "label": "P-1",
                "type": "PIPE",
                "from_node_id": "reservoir-1",
                "to_node_id": "junction-1",
                "input_params": {"length": 100, "diameter": 150, "roughness": 140, "minor_loss_coeff": 0.2, "status": "OPEN"},
            },
            {
                "id": "pump-1",
                "label": "PU-1",
                "type": "PUMP",
                "from_node_id": "junction-1",
                "to_node_id": "tank-1",
                "input_params": {
                    "rated_power": 15,
                    "speed": 1,
                    "status": "ON",
                    "pump_curve": [{"flow": 1, "head": 20}, {"flow": 2, "head": 15}],
                },
            },
            {
                "id": "valve-1",
                "label": "V-1",
                "type": "VALVE",
                "from_node_id": "tank-1",
                "to_node_id": "junction-1",
                "input_params": {"valve_type": "PRV", "diameter": 150, "valve_setting": 18, "status": "ACTIVE"},
            },
            {
                "id": "filter-1",
                "label": "F-1",
                "type": "FILTER",
                "from_node_id": "reservoir-1",
                "to_node_id": "tank-1",
                "input_params": {"mesh_size": 2, "minor_loss_coeff": 0.4, "filter_status": "PARTIALLY_CLOGGED"},
            },
        ],
        "measurements": [
            {
                "id": "measurement-1",
                "element_id": "junction-1",
                "element_type": "NODE",
                "measurement_type": "PRESSURE_HEAD",
                "value": 12.5,
                "unit": "m",
            },
            {
                "id": "measurement-2",
                "element_id": "pipe-1",
                "element_type": "LINK",
                "measurement_type": "FLOW_RATE",
                "value": 4.5,
                "unit": "L/s",
            },
        ],
    }


def test_build_physics_input_preserves_srs_units_and_all_element_types() -> None:
    schematic = SchematicCreate.model_validate(physics_ready_payload())

    physics_input = build_physics_input(schematic)

    assert physics_input.nodes_by_id["junction-1"].base_demand_lps == 2.5
    assert physics_input.nodes_by_id["reservoir-1"].total_head_m == 35
    assert physics_input.nodes_by_id["tank-1"].diameter_m == 7
    assert physics_input.links_by_id["pipe-1"].diameter_mm == 150
    assert physics_input.links_by_id["pump-1"].rated_power_kw == 15
    assert physics_input.links_by_id["valve-1"].valve_setting == 18
    assert physics_input.links_by_id["filter-1"].mesh_size_mm == 2
    assert physics_input.measurements[0].value == 12.5
    assert physics_input.measurements[0].unit == "m"


def test_build_physics_input_indexes_adjacency_for_solver_walks() -> None:
    schematic = SchematicCreate.model_validate(physics_ready_payload())

    physics_input = build_physics_input(schematic)

    assert physics_input.source_node_ids == ("reservoir-1", "tank-1")
    assert physics_input.incident_link_ids_by_node_id["junction-1"] == ("pipe-1", "pump-1", "valve-1")
    assert physics_input.incident_link_ids_by_node_id["reservoir-1"] == ("pipe-1", "filter-1")
    assert physics_input.link_endpoint_node_ids_by_link_id["pump-1"] == ("junction-1", "tank-1")


def test_build_physics_input_raises_structured_errors_for_invalid_saved_graph() -> None:
    schematic = SchematicCreate.model_validate(physics_ready_payload())
    schematic.links[0].to_node_id = "missing-node"

    with pytest.raises(PhysicsInputBuildError) as exc_info:
        build_physics_input(schematic)

    assert "P-1: to_node_id 'missing-node' does not reference a node" in exc_info.value.errors
