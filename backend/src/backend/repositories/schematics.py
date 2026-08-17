from __future__ import annotations

from copy import deepcopy
from typing import Any, Protocol
from uuid import uuid4

from backend.schemas.schematic import SchematicCreate, SchematicUpdate, utc_now_iso


class SchematicRepository(Protocol):
    # Routes depend on this protocol so tests can use in-memory storage while
    # production uses MongoDB behind the same CRUD contract.
    def list(self, user_id: str) -> list[dict[str, Any]]: ...
    def get(self, user_id: str, schematic_id: str) -> dict[str, Any] | None: ...
    def create(self, user_id: str, payload: SchematicCreate) -> dict[str, Any]: ...
    def update(self, user_id: str, schematic_id: str, payload: SchematicUpdate) -> dict[str, Any] | None: ...
    def delete(self, user_id: str, schematic_id: str) -> bool: ...


class InMemorySchematicRepository:
    # Local/test fallback. It preserves ownership behavior without requiring a
    # running Mongo instance for every development command.
    def __init__(self) -> None:
        self._documents: dict[str, dict[str, Any]] = {}

    def list(self, user_id: str) -> list[dict[str, Any]]:
        documents = [
            deepcopy(document)
            for document in self._documents.values()
            if document["user_id"] == user_id
        ]
        return sorted(documents, key=lambda document: document["updated_at"], reverse=True)

    def get(self, user_id: str, schematic_id: str) -> dict[str, Any] | None:
        document = self._documents.get(schematic_id)
        if not document or document["user_id"] != user_id:
            return None
        return deepcopy(document)

    def create(self, user_id: str, payload: SchematicCreate) -> dict[str, Any]:
        now = utc_now_iso()
        document = {
            **payload.model_dump(mode="json"),
            "id": str(uuid4()),
            "user_id": user_id,
            "created_at": now,
            "updated_at": now,
        }
        self._documents[document["id"]] = deepcopy(document)
        return deepcopy(document)

    def update(self, user_id: str, schematic_id: str, payload: SchematicUpdate) -> dict[str, Any] | None:
        existing = self.get(user_id, schematic_id)
        if existing is None:
            return None
        document = {
            **payload.model_dump(mode="json"),
            "id": schematic_id,
            "user_id": user_id,
            "created_at": existing["created_at"],
            "updated_at": utc_now_iso(),
        }
        self._documents[schematic_id] = deepcopy(document)
        return deepcopy(document)

    def delete(self, user_id: str, schematic_id: str) -> bool:
        existing = self.get(user_id, schematic_id)
        if existing is None:
            return False
        del self._documents[schematic_id]
        return True


class MongoSchematicRepository:
    # Mongo stores API-ready documents with `_id` hidden from callers. The public
    # id is a UUID string so the frontend never needs ObjectId handling.
    def __init__(self, collection: Any) -> None:
        self.collection = collection
        self.collection.create_index([("user_id", 1), ("updated_at", -1)])
        self.collection.create_index([("id", 1), ("user_id", 1)], unique=True)

    def list(self, user_id: str) -> list[dict[str, Any]]:
        documents = self.collection.find({"user_id": user_id}, {"_id": 0}).sort("updated_at", -1)
        return list(documents)

    def get(self, user_id: str, schematic_id: str) -> dict[str, Any] | None:
        return self.collection.find_one({"id": schematic_id, "user_id": user_id}, {"_id": 0})

    def create(self, user_id: str, payload: SchematicCreate) -> dict[str, Any]:
        now = utc_now_iso()
        document = {
            **payload.model_dump(mode="json"),
            "id": str(uuid4()),
            "user_id": user_id,
            "created_at": now,
            "updated_at": now,
        }
        self.collection.insert_one(document)
        document.pop("_id", None)
        return document

    def update(self, user_id: str, schematic_id: str, payload: SchematicUpdate) -> dict[str, Any] | None:
        existing = self.get(user_id, schematic_id)
        if existing is None:
            return None
        document = {
            **payload.model_dump(mode="json"),
            "id": schematic_id,
            "user_id": user_id,
            "created_at": existing["created_at"],
            "updated_at": utc_now_iso(),
        }
        self.collection.replace_one({"id": schematic_id, "user_id": user_id}, document)
        return document

    def delete(self, user_id: str, schematic_id: str) -> bool:
        result = self.collection.delete_one({"id": schematic_id, "user_id": user_id})
        return result.deleted_count == 1
