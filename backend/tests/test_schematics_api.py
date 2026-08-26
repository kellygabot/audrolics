from fastapi.testclient import TestClient

from backend.database import get_schematic_repository
from backend.main import app
from backend.repositories.schematics import InMemorySchematicRepository


def client_with_repo() -> TestClient:
    repository = InMemorySchematicRepository()
    app.dependency_overrides[get_schematic_repository] = lambda: repository
    return TestClient(app)


def valid_payload() -> dict:
    return {
        "name": "Main field segment",
        "nodes": [
            {
                "id": "node-1",
                "label": "J-1",
                "type": "JUNCTION",
                "x": 10,
                "y": 20,
                "input_params": {"elevation": 0, "base_demand": 1},
                "computed": {},
            }
        ],
        "links": [],
        "measurements": [],
    }


def test_schematic_crud_is_scoped_by_dev_user_header() -> None:
    client = client_with_repo()

    created = client.post("/api/v1/schematics", json=valid_payload(), headers={"X-User-Id": "alpha"})

    assert created.status_code == 201
    schematic_id = created.json()["id"]

    own_list = client.get("/api/v1/schematics", headers={"X-User-Id": "alpha"})
    other_list = client.get("/api/v1/schematics", headers={"X-User-Id": "beta"})
    other_get = client.get(f"/api/v1/schematics/{schematic_id}", headers={"X-User-Id": "beta"})

    assert own_list.json()[0]["id"] == schematic_id
    assert other_list.json() == []
    assert other_get.status_code == 404


def test_missing_dev_user_header_is_rejected() -> None:
    client = client_with_repo()

    response = client.get("/api/v1/schematics")

    assert response.status_code == 401
    assert response.json()["detail"]["error_code"] == "E400"


def test_invalid_section_3_input_is_rejected() -> None:
    client = client_with_repo()
    payload = valid_payload()
    payload["nodes"][0]["input_params"] = {"elevation": 6000, "base_demand": -1}

    response = client.post("/api/v1/schematics", json=payload, headers={"X-User-Id": "alpha"})

    assert response.status_code == 422


def test_element_payloads_get_srs_computed_defaults() -> None:
    client = client_with_repo()
    payload = valid_payload()
    payload["nodes"].append(
        {
            "id": "node-2",
            "label": "R-1",
            "type": "RESERVOIR",
            "x": 100,
            "y": 20,
            "input_params": {"total_head": 20},
        }
    )
    payload["links"].append(
        {
            "id": "link-1",
            "label": "P-1",
            "type": "PIPE",
            "from_node_id": "node-2",
            "to_node_id": "node-1",
            "input_params": {
                "length": 100,
                "diameter": 150,
                "roughness": 140,
                "minor_loss_coeff": 0,
                "status": "OPEN",
            },
        }
    )

    response = client.post("/api/v1/schematics", json=payload, headers={"X-User-Id": "alpha"})

    assert response.status_code == 201
    body = response.json()
    assert body["nodes"][0]["computed"] == {"pressure_head": None, "actual_demand": None}
    assert body["nodes"][1]["computed"] == {"outflow": None}
    assert body["links"][0]["computed"] == {
        "flow_rate": None,
        "velocity": None,
        "headloss": None,
        "unit_headloss": None,
    }


def test_pipe_input_params_get_hydraulic_defaults() -> None:
    client = client_with_repo()
    payload = valid_payload()
    payload["nodes"].append(
        {
            "id": "node-2",
            "label": "R-1",
            "type": "RESERVOIR",
            "x": 100,
            "y": 20,
            "input_params": {"total_head": 20},
        }
    )
    payload["links"].append(
        {
            "id": "link-1",
            "label": "P-1",
            "type": "PIPE",
            "from_node_id": "node-2",
            "to_node_id": "node-1",
            "input_params": {
                "length": 100,
                "diameter": 150,
            },
        }
    )

    response = client.post("/api/v1/schematics", json=payload, headers={"X-User-Id": "alpha"})

    assert response.status_code == 201
    assert response.json()["links"][0]["input_params"] == {
        "length": 100,
        "diameter": 150,
        "roughness": 140,
        "minor_loss_coeff": 0,
        "status": "OPEN",
    }


def test_wrong_element_input_params_are_rejected() -> None:
    client = client_with_repo()
    payload = valid_payload()
    payload["nodes"][0]["input_params"] = {"elevation": 0, "base_demand": 1, "diameter": 150}

    response = client.post("/api/v1/schematics", json=payload, headers={"X-User-Id": "alpha"})

    assert response.status_code == 422


def test_measurements_default_entered_at_and_validate_element_type() -> None:
    client = client_with_repo()
    payload = valid_payload()
    payload["measurements"] = [
        {
            "id": "measurement-1",
            "element_id": "node-1",
            "element_type": "NODE",
            "measurement_type": "PRESSURE_HEAD",
            "value": 12.5,
            "unit": "m",
            "timestamp": "2026-08-18T12:00:00+08:00",
        }
    ]

    response = client.post("/api/v1/schematics", json=payload, headers={"X-User-Id": "alpha"})

    assert response.status_code == 201
    measurement = response.json()["measurements"][0]
    assert measurement["entered_at"] is not None

    payload["measurements"][0]["element_id"] = "missing-node"
    invalid = client.post("/api/v1/schematics", json=payload, headers={"X-User-Id": "alpha"})
    assert invalid.status_code == 422
