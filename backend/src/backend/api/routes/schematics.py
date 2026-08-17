from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status

from backend.database import get_schematic_repository
from backend.repositories.schematics import SchematicRepository
from backend.schemas.schematic import SchematicCreate, SchematicResponse, SchematicSummary, SchematicUpdate

router = APIRouter(prefix="/api/v1/schematics", tags=["schematics"])


def require_user_id(x_user_id: Annotated[str | None, Header()] = None) -> str:
    # Temporary Feature 1 ownership boundary. Feature 4 auth should replace this
    # header with the authenticated user id.
    if not x_user_id or not x_user_id.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "E400",
                "message": "X-User-Id header is required until authentication is implemented.",
            },
        )
    return x_user_id.strip()


@router.get("", response_model=list[SchematicSummary])
def list_schematics(
    user_id: Annotated[str, Depends(require_user_id)],
    repository: Annotated[SchematicRepository, Depends(get_schematic_repository)],
) -> list[SchematicSummary]:
    return [
        SchematicSummary(id=document["id"], name=document["name"], updated_at=document["updated_at"])
        for document in repository.list(user_id)
    ]


@router.post("", response_model=SchematicResponse, status_code=status.HTTP_201_CREATED)
def create_schematic(
    payload: SchematicCreate,
    user_id: Annotated[str, Depends(require_user_id)],
    repository: Annotated[SchematicRepository, Depends(get_schematic_repository)],
) -> SchematicResponse:
    return SchematicResponse(**repository.create(user_id, payload))


@router.get("/{schematic_id}", response_model=SchematicResponse)
def get_schematic(
    schematic_id: str,
    user_id: Annotated[str, Depends(require_user_id)],
    repository: Annotated[SchematicRepository, Depends(get_schematic_repository)],
) -> SchematicResponse:
    document = repository.get(user_id, schematic_id)
    if document is None:
        raise_not_found(schematic_id)
    return SchematicResponse(**document)


@router.put("/{schematic_id}", response_model=SchematicResponse)
def update_schematic(
    schematic_id: str,
    payload: SchematicUpdate,
    user_id: Annotated[str, Depends(require_user_id)],
    repository: Annotated[SchematicRepository, Depends(get_schematic_repository)],
) -> SchematicResponse:
    document = repository.update(user_id, schematic_id, payload)
    if document is None:
        raise_not_found(schematic_id)
    return SchematicResponse(**document)


@router.delete("/{schematic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schematic(
    schematic_id: str,
    user_id: Annotated[str, Depends(require_user_id)],
    repository: Annotated[SchematicRepository, Depends(get_schematic_repository)],
) -> Response:
    deleted = repository.delete(user_id, schematic_id)
    if not deleted:
        raise_not_found(schematic_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def raise_not_found(schematic_id: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "error_code": "E404",
            "message": f"Schematic '{schematic_id}' does not exist or you do not have permission to access it.",
        },
    )
