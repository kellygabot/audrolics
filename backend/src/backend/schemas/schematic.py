from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class NodeType(StrEnum):
    JUNCTION = "JUNCTION"
    RESERVOIR = "RESERVOIR"
    TANK = "TANK"


class LinkType(StrEnum):
    PIPE = "PIPE"
    PUMP = "PUMP"
    VALVE = "VALVE"
    FILTER = "FILTER"


class ElementKind(StrEnum):
    NODE = "NODE"
    LINK = "LINK"


class MeasurementType(StrEnum):
    PRESSURE_HEAD = "PRESSURE_HEAD"
    FLOW_RATE = "FLOW_RATE"


class Point(BaseModel):
    x: float
    y: float


class NodePayload(BaseModel):
    id: str
    label: str
    type: NodeType
    x: float
    y: float
    input_params: dict[str, Any] = Field(default_factory=dict)
    computed: dict[str, Any] = Field(default_factory=dict)


class LinkPayload(BaseModel):
    id: str
    label: str
    type: LinkType
    from_node_id: str | None = None
    to_node_id: str | None = None
    points: list[Point] = Field(default_factory=list)
    input_params: dict[str, Any] = Field(default_factory=dict)
    computed: dict[str, Any] = Field(default_factory=dict)


class MeasurementPayload(BaseModel):
    id: str
    element_id: str
    element_type: ElementKind
    measurement_type: MeasurementType
    value: float | None = None
    unit: str | None = None
    timestamp: str | None = None
    entered_at: str | None = None


class CanvasState(BaseModel):
    zoom: float = 100
    pan: Point = Field(default_factory=lambda: Point(x=0, y=0))


class Thresholds(BaseModel):
    threshold_pressure_pct: float = 5
    threshold_pressure_abs: float = 0.5
    threshold_flow_pct: float = 10
    threshold_flow_abs: float = 0.5


class FilterMultipliers(BaseModel):
    clean: float = 1
    partially_clogged: float = 3
    clogged: float = 10


class Styling(BaseModel):
    line_color: str = "#0f766e"
    line_thickness: float = 2
    symbol_size: float = 1


class Visibility(BaseModel):
    length: bool = True
    diameter: bool = True
    pressure: bool = True
    flow: bool = True
    elevation: bool = True


class SchematicBase(BaseModel):
    # Feature 1 persists the whole builder document together. The SRS lists
    # nodes/links/measurements separately, but embedding keeps save/load atomic.
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=120)
    nodes: list[NodePayload] = Field(default_factory=list)
    links: list[LinkPayload] = Field(default_factory=list)
    measurements: list[MeasurementPayload] = Field(default_factory=list)
    canvas_state: CanvasState = Field(default_factory=CanvasState)
    thresholds: Thresholds = Field(default_factory=Thresholds)
    filter_multipliers: FilterMultipliers = Field(default_factory=FilterMultipliers)
    styling: Styling = Field(default_factory=Styling)
    visibility: Visibility = Field(default_factory=Visibility)

    @field_validator("nodes")
    @classmethod
    def node_ids_must_be_unique(cls, nodes: list[NodePayload]) -> list[NodePayload]:
        ids = [node.id for node in nodes]
        labels = [node.label for node in nodes]
        if len(ids) != len(set(ids)):
            raise ValueError("Node ids must be unique.")
        if len(labels) != len(set(labels)):
            raise ValueError("Node labels must be unique.")
        return nodes

    @field_validator("links")
    @classmethod
    def link_ids_must_be_unique(cls, links: list[LinkPayload]) -> list[LinkPayload]:
        ids = [link.id for link in links]
        labels = [link.label for link in links]
        if len(ids) != len(set(ids)):
            raise ValueError("Link ids must be unique.")
        if len(labels) != len(set(labels)):
            raise ValueError("Link labels must be unique.")
        return links

    @model_validator(mode="after")
    def validate_section_3_rules(self) -> SchematicBase:
        # This mirrors the frontend validation, but remains authoritative for
        # persistence because API callers can bypass the browser UI.
        errors: list[str] = []
        node_ids = {node.id for node in self.nodes}
        for node in self.nodes:
            errors.extend(validate_node(node))
        for link in self.links:
            errors.extend(validate_link(link, node_ids))
        if errors:
            raise ValueError("; ".join(errors))
        return self


class SchematicCreate(SchematicBase):
    pass


class SchematicUpdate(SchematicBase):
    pass


class SchematicSummary(BaseModel):
    id: str
    name: str
    updated_at: str


class SchematicResponse(SchematicBase):
    id: str
    user_id: str
    created_at: str
    updated_at: str


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_node(node: NodePayload) -> list[str]:
    # Computed values are intentionally not validated here. Feature 1 stores the
    # editable builder inputs; simulations will populate computed values later.
    params = node.input_params
    if node.type == NodeType.JUNCTION:
        return [
            *require_number(node, params, "elevation", -100, 5000),
            *require_number(node, params, "base_demand", 0, None),
        ]
    if node.type == NodeType.RESERVOIR:
        return require_number(node, params, "total_head", -100, 5000)
    if node.type == NodeType.TANK:
        errors = [
            *require_number(node, params, "elevation", -100, 5000),
            *require_number(node, params, "diameter", 0, None, exclusive_min=True),
            *require_number(node, params, "min_level", 0, None),
            *require_number(node, params, "max_level", 0, None),
            *require_number(node, params, "initial_level", 0, None),
        ]
        min_level = params.get("min_level")
        initial = params.get("initial_level")
        max_level = params.get("max_level")
        if all(is_number(value) for value in [min_level, initial, max_level]) and not (
            min_level <= initial <= max_level
        ):
            errors.append(f"E202 {node.label}: min_level <= initial_level <= max_level is required")
        return errors
    return []


def validate_link(link: LinkPayload, node_ids: set[str]) -> list[str]:
    # Link endpoint checks keep the saved graph usable for the future solver.
    params = link.input_params
    errors: list[str] = []
    if not link.from_node_id or not link.to_node_id:
        errors.append(f"E102 {link.label}: both link endpoints must be connected")
    if link.from_node_id and link.from_node_id not in node_ids:
        errors.append(f"E102 {link.label}: from_node_id does not reference a node")
    if link.to_node_id and link.to_node_id not in node_ids:
        errors.append(f"E102 {link.label}: to_node_id does not reference a node")

    if link.type == LinkType.PIPE:
        errors.extend(require_number(link, params, "length", 0, 100000, exclusive_min=True))
        errors.extend(require_number(link, params, "diameter", 0, None, exclusive_min=True))
        errors.extend(require_number(link, params, "roughness", 1, 150))
        errors.extend(require_number(link, params, "minor_loss_coeff", 0, None))
        errors.extend(require_choice(link, params, "status", {"OPEN", "CLOSED"}))
    elif link.type == LinkType.PUMP:
        errors.extend(require_choice(link, params, "status", {"ON", "OFF"}))
        errors.extend(require_number(link, params, "speed", 0, None, exclusive_min=True))
        curve = params.get("pump_curve")
        rated_power = params.get("rated_power")
        if curve:
            errors.extend(validate_curve(link, curve, "pump_curve", "head"))
        elif not is_number(rated_power) or rated_power <= 0:
            errors.append(f"E200 {link.label}: pump_curve or rated_power > 0 is required")
    elif link.type == LinkType.VALVE:
        errors.extend(require_choice(link, params, "status", {"OPEN", "CLOSED", "ACTIVE"}))
        errors.extend(require_choice(link, params, "valve_type", {"PRV", "PSV", "PBV", "FCV", "TCV", "GPV"}))
        errors.extend(require_number(link, params, "diameter", 0, None, exclusive_min=True))
        if params.get("valve_type") == "GPV":
            errors.extend(validate_curve(link, params.get("gpv_curve"), "gpv_curve", "headloss"))
        else:
            errors.extend(require_number(link, params, "valve_setting", 0, None, exclusive_min=True))
    elif link.type == LinkType.FILTER:
        errors.extend(require_number(link, params, "mesh_size", 0, None, exclusive_min=True))
        errors.extend(require_number(link, params, "minor_loss_coeff", 0, None))
        errors.extend(require_choice(link, params, "filter_status", {"CLEAN", "PARTIALLY_CLOGGED", "CLOGGED"}))
    return errors


def require_number(
    element: NodePayload | LinkPayload,
    params: dict[str, Any],
    key: str,
    minimum: float | None,
    maximum: float | None,
    *,
    exclusive_min: bool = False,
) -> list[str]:
    value = params.get(key)
    if not is_number(value):
        return [f"E200 {element.label}: {key} must be a number"]
    if minimum is not None and (value <= minimum if exclusive_min else value < minimum):
        comparator = ">" if exclusive_min else ">="
        return [f"E200 {element.label}: {key} must be {comparator} {minimum}"]
    if maximum is not None and value > maximum:
        return [f"E200 {element.label}: {key} must be <= {maximum}"]
    return []


def require_choice(
    element: NodePayload | LinkPayload,
    params: dict[str, Any],
    key: str,
    choices: set[str],
) -> list[str]:
    value = params.get(key)
    if value not in choices:
        return [f"E200 {element.label}: {key} must be one of {', '.join(sorted(choices))}"]
    return []


def validate_curve(
    element: LinkPayload,
    curve: Any,
    key: str,
    y_key: str,
) -> list[str]:
    # Pump and GPV curves are the only Section 3 inputs with multi-row shape.
    # The solver is not implemented yet, but invalid curve data should not persist.
    if not isinstance(curve, list) or len(curve) < 2:
        return [f"E201 {element.label}: {key} requires at least 2 points"]
    flows: list[float] = []
    values: list[float] = []
    for point in curve:
        if not isinstance(point, dict) or not is_number(point.get("flow")) or not is_number(point.get(y_key)):
            return [f"E201 {element.label}: {key} points require flow and {y_key} numbers"]
        flows.append(point["flow"])
        values.append(point[y_key])
    if len(flows) != len(set(flows)):
        return [f"E201 {element.label}: {key} cannot contain duplicate flow values"]
    if flows != sorted(flows):
        return [f"E201 {element.label}: {key} flow values must increase"]
    if y_key == "head" and any(values[index] < values[index + 1] for index in range(len(values) - 1)):
        return [f"E201 {element.label}: pump head must decrease as flow increases"]
    if y_key == "headloss" and any(values[index] > values[index + 1] for index in range(len(values) - 1)):
        return [f"E201 {element.label}: GPV headloss must increase as flow increases"]
    return []


def is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)
