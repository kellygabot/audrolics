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
