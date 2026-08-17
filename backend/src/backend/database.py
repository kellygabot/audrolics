from __future__ import annotations

import os
from functools import lru_cache

from backend.repositories.schematics import InMemorySchematicRepository, MongoSchematicRepository, SchematicRepository


@lru_cache
def get_schematic_repository() -> SchematicRepository:
    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri or mongodb_uri == "{URI}":
        return InMemorySchematicRepository()

    from pymongo import MongoClient

    client = MongoClient(mongodb_uri)
    database_name = os.getenv("MONGODB_DATABASE", "audrolics")
    return MongoSchematicRepository(client[database_name]["schematics"])
