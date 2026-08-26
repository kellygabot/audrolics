from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from backend.repositories.schematics import InMemorySchematicRepository, MongoSchematicRepository, SchematicRepository


def load_environment() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    backend_env = Path(__file__).resolve().parents[2] / ".env"
    project_env = Path(__file__).resolve().parents[3] / ".env"
    load_dotenv(backend_env)
    load_dotenv(project_env, override=False)


@lru_cache
def get_schematic_repository() -> SchematicRepository:
    load_environment()
    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri or mongodb_uri == "{URI}":
        return InMemorySchematicRepository()

    from pymongo import MongoClient

    client = MongoClient(mongodb_uri)
    database_name = os.getenv("MONGODB_DATABASE", "audrolics")
    return MongoSchematicRepository(client[database_name]["schematics"])
