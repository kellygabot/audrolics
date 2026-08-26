from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypeAlias

from backend.schemas.schematic import (
    ElementKind,
    LinkPayload,
    LinkType,
    MeasurementPayload,
    NodePayload,
    NodeType,
    SchematicBase,
)


class PhysicsInputBuildError(ValueError):
    """Raised when a saved schematic cannot be converted into solver inputs."""

    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("; ".join(errors))


@dataclass(frozen=True)
class CurvePointInput:
    # Flow coordinate from pump/GPV curve rows. SRS/UI unit: L/s.
    flow_lps: float
    # Head coordinate for pump curves. SRS/UI unit: meters of head.
    head_m: float | None = None
    # Headloss coordinate for GPV curves. SRS/UI unit: meters.
    headloss_m: float | None = None


@dataclass(frozen=True)
class JunctionInput:
    # Stable node id from the saved schematic; used as graph vertex id.
    id: str
    # User-facing label such as J-1; useful for solver errors and reports.
    label: str
    # Canvas x coordinate in pixels; not used in physics, but preserved for result mapping.
    x_px: float
    # Canvas y coordinate in pixels; not used in physics, but preserved for result mapping.
    y_px: float
    # Junction elevation relative to the project datum. SRS/UI unit: meters.
    elevation_m: float
    # Required steady-state demand at this junction. SRS/UI unit: L/s.
    base_demand_lps: float
    # Placeholder captured by the SRS for future EPS; ignored by v1 steady-state physics.
    demand_pattern: str | None = None
    # Node category used by graph and solver dispatch.
    type: Literal["JUNCTION"] = "JUNCTION"


@dataclass(frozen=True)
class ReservoirInput:
    # Stable node id from the saved schematic; used as graph vertex id.
    id: str
    # User-facing label such as R-1; useful for solver errors and reports.
    label: str
    # Canvas x coordinate in pixels; not used in physics, but preserved for result mapping.
    x_px: float
    # Canvas y coordinate in pixels; not used in physics, but preserved for result mapping.
    y_px: float
    # Fixed hydraulic grade/source head. SRS/UI unit: meters.
    total_head_m: float
    # Node category used by graph and solver dispatch.
    type: Literal["RESERVOIR"] = "RESERVOIR"


@dataclass(frozen=True)
class TankInput:
    # Stable node id from the saved schematic; used as graph vertex id.
    id: str
    # User-facing label such as T-1; useful for solver errors and reports.
    label: str
    # Canvas x coordinate in pixels; not used in physics, but preserved for result mapping.
    x_px: float
    # Canvas y coordinate in pixels; not used in physics, but preserved for result mapping.
    y_px: float
    # Tank base elevation relative to datum. SRS/UI unit: meters.
    elevation_m: float
    # Tank diameter. SRS/UI unit: meters.
    diameter_m: float
    # Minimum allowed water level above tank base. SRS/UI unit: meters.
    min_level_m: float
    # Maximum allowed water level above tank base. SRS/UI unit: meters.
    max_level_m: float
    # Initial water level for the steady-state snapshot. SRS/UI unit: meters.
    initial_level_m: float
    # Node category used by graph and solver dispatch.
    type: Literal["TANK"] = "TANK"


PhysicsNodeInput: TypeAlias = JunctionInput | ReservoirInput | TankInput


@dataclass(frozen=True)
class PipeInput:
    # Stable link id from the saved schematic; used as graph edge id.
    id: str
    # User-facing label such as P-1; useful for solver errors and reports.
    label: str
    # Upstream/source endpoint id as drawn in the schematic.
    from_node_id: str
    # Downstream/target endpoint id as drawn in the schematic.
    to_node_id: str
    # Pipe length. SRS/UI unit: meters.
    length_m: float
    # Pipe diameter. SRS/UI unit: millimeters; solver may convert later.
    diameter_mm: float
    # Hazen-Williams C-factor, unitless roughness coefficient.
    roughness_c: float
    # Minor loss coefficient K, unitless.
    minor_loss_coeff: float
    # Pipe open/closed control state from the schematic.
    status: Literal["OPEN", "CLOSED"]
    # Link category used by graph and solver dispatch.
    type: Literal["PIPE"] = "PIPE"


@dataclass(frozen=True)
class PumpInput:
    # Stable link id from the saved schematic; used as graph edge id.
    id: str
    # User-facing label such as PU-1; useful for solver errors and reports.
    label: str
    # Inlet endpoint id as drawn in the schematic.
    from_node_id: str
    # Outlet endpoint id as drawn in the schematic.
    to_node_id: str
    # Optional rated power. SRS/UI unit: kW.
    rated_power_kw: float | None
    # Pump speed setting multiplier, unitless.
    speed_setting: float
    # Pump operating state.
    status: Literal["ON", "OFF"]
    # Pump curve rows: flow in L/s, head in m.
    pump_curve: tuple[CurvePointInput, ...]
    # Link category used by graph and solver dispatch.
    type: Literal["PUMP"] = "PUMP"


@dataclass(frozen=True)
class ValveInput:
    # Stable link id from the saved schematic; used as graph edge id.
    id: str
    # User-facing label such as V-1; useful for solver errors and reports.
    label: str
    # Inlet endpoint id as drawn in the schematic.
    from_node_id: str
    # Outlet endpoint id as drawn in the schematic.
    to_node_id: str
    # Valve behavior type: PRV, PSV, PBV, FCV, TCV, or GPV.
    valve_type: Literal["PRV", "PSV", "PBV", "FCV", "TCV", "GPV"]
    # Valve diameter. SRS/UI unit: millimeters.
    diameter_mm: float
    # Valve setting; SRS unit depends on valve_type and is intentionally preserved.
    valve_setting: float | None
    # Valve open/closed/active control state.
    status: Literal["OPEN", "CLOSED", "ACTIVE"]
    # GPV curve rows: flow in L/s, headloss in m; empty for non-GPV valves.
    gpv_curve: tuple[CurvePointInput, ...]
    # Link category used by graph and solver dispatch.
    type: Literal["VALVE"] = "VALVE"


@dataclass(frozen=True)
class FilterInput:
    # Stable link id from the saved schematic; used as graph edge id.
    id: str
    # User-facing label such as F-1; useful for solver errors and reports.
    label: str
    # Inlet endpoint id as drawn in the schematic.
    from_node_id: str
    # Outlet endpoint id as drawn in the schematic.
    to_node_id: str
    # Strainer/filter mesh or screen size. SRS/UI unit: millimeters.
    mesh_size_mm: float
    # Clean-state minor loss coefficient K, unitless.
    minor_loss_coeff_clean: float
    # Clogging state that selects the per-schematic headloss multiplier.
    filter_status: Literal["CLEAN", "PARTIALLY_CLOGGED", "CLOGGED"]
    # Link category used by graph and solver dispatch.
    type: Literal["FILTER"] = "FILTER"


PhysicsLinkInput: TypeAlias = PipeInput | PumpInput | ValveInput | FilterInput


@dataclass(frozen=True)
class MeasurementInput:
    # Stable measurement id from the saved schematic.
    id: str
    # Node or link id where the field measurement was taken.
    element_id: str
    # Whether element_id points at a node or a link.
    element_kind: Literal["NODE", "LINK"]
    # Measurement type: node pressure head or link flow rate.
    measurement_type: Literal["PRESSURE_HEAD", "FLOW_RATE"]
    # Measured field value in the SRS/UI unit declared by unit.
    value: float
    # Unit string from the SRS/API, usually "m" for pressure head or "L/s" for flow.
    unit: str
    # Field measurement timestamp when available.
    timestamp: str | None
    # Time this measurement was entered into Audrolics.
    entered_at: str


@dataclass(frozen=True)
class ThresholdInput:
    # Pressure residual percent threshold. SRS default: 5%.
    pressure_pct: float
    # Pressure residual absolute threshold. SRS/UI unit: meters.
    pressure_abs_m: float
    # Flow residual percent threshold. SRS default: 10%.
    flow_pct: float
    # Flow residual absolute threshold. SRS/UI unit: L/s.
    flow_abs_lps: float


@dataclass(frozen=True)
class FilterMultiplierInput:
    # Multiplier applied when the filter_status is CLEAN.
    clean: float
    # Multiplier applied when the filter_status is PARTIALLY_CLOGGED.
    partially_clogged: float
    # Multiplier applied when the filter_status is CLOGGED.
    clogged: float


@dataclass(frozen=True)
class PhysicsNetworkInput:
    # Schematic name used in diagnostics and result reports.
    name: str
    # Typed node inputs in schematic order.
    nodes: tuple[PhysicsNodeInput, ...]
    # Typed link inputs in schematic order.
    links: tuple[PhysicsLinkInput, ...]
    # Manual field measurements used after simulation for anomaly comparison.
    measurements: tuple[MeasurementInput, ...]
    # Per-schematic residual thresholds for anomaly detection.
    thresholds: ThresholdInput
    # Per-schematic strainer/filter headloss multipliers.
    filter_multipliers: FilterMultiplierInput
    # Node lookup for solver code that needs random access by id.
    nodes_by_id: dict[str, PhysicsNodeInput]
    # Link lookup for solver code that needs random access by id.
    links_by_id: dict[str, PhysicsLinkInput]
    # Link ids touching each node id, preserving schematic link order.
    incident_link_ids_by_node_id: dict[str, tuple[str, ...]]
    # Endpoint node ids for each link id as (from_node_id, to_node_id).
    link_endpoint_node_ids_by_link_id: dict[str, tuple[str, str]]
    # Reservoir and tank ids; these are source nodes for network validation/solving.
    source_node_ids: tuple[str, ...]


def build_physics_input(schematic: SchematicBase) -> PhysicsNetworkInput:
    """Convert a validated saved schematic into strict, solver-facing inputs."""

    errors: list[str] = []
    nodes = tuple(_build_node(node, errors) for node in schematic.nodes)
    node_ids = {node.id for node in nodes}
    links = tuple(_build_link(link, node_ids, errors) for link in schematic.links)
    link_ids = {link.id for link in links}
    measurements = tuple(_build_measurement(measurement, node_ids, link_ids, errors) for measurement in schematic.measurements)

    if errors:
        raise PhysicsInputBuildError(errors)

    nodes_by_id = {node.id: node for node in nodes}
    links_by_id = {link.id: link for link in links}
    incident_link_ids = {node.id: [] for node in nodes}
    endpoint_ids: dict[str, tuple[str, str]] = {}
    for link in links:
        incident_link_ids[link.from_node_id].append(link.id)
        incident_link_ids[link.to_node_id].append(link.id)
        endpoint_ids[link.id] = (link.from_node_id, link.to_node_id)

    return PhysicsNetworkInput(
        name=schematic.name,
        nodes=nodes,
        links=links,
        measurements=measurements,
        thresholds=ThresholdInput(
            pressure_pct=schematic.thresholds.threshold_pressure_pct,
            pressure_abs_m=schematic.thresholds.threshold_pressure_abs,
            flow_pct=schematic.thresholds.threshold_flow_pct,
            flow_abs_lps=schematic.thresholds.threshold_flow_abs,
        ),
        filter_multipliers=FilterMultiplierInput(
            clean=schematic.filter_multipliers.clean,
            partially_clogged=schematic.filter_multipliers.partially_clogged,
            clogged=schematic.filter_multipliers.clogged,
        ),
        nodes_by_id=nodes_by_id,
        links_by_id=links_by_id,
        incident_link_ids_by_node_id={node_id: tuple(link_ids) for node_id, link_ids in incident_link_ids.items()},
        link_endpoint_node_ids_by_link_id=endpoint_ids,
        source_node_ids=tuple(node.id for node in nodes if isinstance(node, ReservoirInput | TankInput)),
    )


def _build_node(node: NodePayload, errors: list[str]) -> PhysicsNodeInput:
    params = node.input_params
    if node.type == NodeType.JUNCTION:
        return JunctionInput(
            id=node.id,
            label=node.label,
            x_px=node.x,
            y_px=node.y,
            elevation_m=params["elevation"],
            base_demand_lps=params["base_demand"],
            demand_pattern=params.get("demand_pattern"),
        )
    if node.type == NodeType.RESERVOIR:
        return ReservoirInput(
            id=node.id,
            label=node.label,
            x_px=node.x,
            y_px=node.y,
            total_head_m=params["total_head"],
        )
    if node.type == NodeType.TANK:
        return TankInput(
            id=node.id,
            label=node.label,
            x_px=node.x,
            y_px=node.y,
            elevation_m=params["elevation"],
            diameter_m=params["diameter"],
            min_level_m=params["min_level"],
            max_level_m=params["max_level"],
            initial_level_m=params["initial_level"],
        )
    errors.append(f"{node.label}: unsupported node type {node.type}")
    return JunctionInput(node.id, node.label, node.x, node.y, 0, 0)


def _build_link(link: LinkPayload, node_ids: set[str], errors: list[str]) -> PhysicsLinkInput:
    from_node_id, to_node_id = _require_link_endpoints(link, node_ids, errors)
    params = link.input_params
    if link.type == LinkType.PIPE:
        return PipeInput(
            id=link.id,
            label=link.label,
            from_node_id=from_node_id,
            to_node_id=to_node_id,
            length_m=params["length"],
            diameter_mm=params["diameter"],
            roughness_c=params["roughness"],
            minor_loss_coeff=params["minor_loss_coeff"],
            status=params["status"],
        )
    if link.type == LinkType.PUMP:
        return PumpInput(
            id=link.id,
            label=link.label,
            from_node_id=from_node_id,
            to_node_id=to_node_id,
            rated_power_kw=params.get("rated_power"),
            speed_setting=params["speed"],
            status=params["status"],
            pump_curve=tuple(CurvePointInput(flow_lps=point["flow"], head_m=point["head"]) for point in params.get("pump_curve", [])),
        )
    if link.type == LinkType.VALVE:
        return ValveInput(
            id=link.id,
            label=link.label,
            from_node_id=from_node_id,
            to_node_id=to_node_id,
            valve_type=params["valve_type"],
            diameter_mm=params["diameter"],
            valve_setting=params.get("valve_setting"),
            status=params["status"],
            gpv_curve=tuple(CurvePointInput(flow_lps=point["flow"], headloss_m=point["headloss"]) for point in params.get("gpv_curve", [])),
        )
    if link.type == LinkType.FILTER:
        return FilterInput(
            id=link.id,
            label=link.label,
            from_node_id=from_node_id,
            to_node_id=to_node_id,
            mesh_size_mm=params["mesh_size"],
            minor_loss_coeff_clean=params["minor_loss_coeff"],
            filter_status=params["filter_status"],
        )
    errors.append(f"{link.label}: unsupported link type {link.type}")
    return PipeInput(link.id, link.label, from_node_id, to_node_id, 1, 1, 1, 0, "CLOSED")


def _require_link_endpoints(link: LinkPayload, node_ids: set[str], errors: list[str]) -> tuple[str, str]:
    from_node_id = link.from_node_id or ""
    to_node_id = link.to_node_id or ""
    if not from_node_id:
        errors.append(f"{link.label}: from_node_id is required")
    elif from_node_id not in node_ids:
        errors.append(f"{link.label}: from_node_id '{from_node_id}' does not reference a node")
    if not to_node_id:
        errors.append(f"{link.label}: to_node_id is required")
    elif to_node_id not in node_ids:
        errors.append(f"{link.label}: to_node_id '{to_node_id}' does not reference a node")
    return from_node_id, to_node_id


def _build_measurement(
    measurement: MeasurementPayload,
    node_ids: set[str],
    link_ids: set[str],
    errors: list[str],
) -> MeasurementInput:
    if measurement.element_type == ElementKind.NODE and measurement.element_id not in node_ids:
        errors.append(f"measurement {measurement.id}: element_id '{measurement.element_id}' does not reference a node")
    if measurement.element_type == ElementKind.LINK and measurement.element_id not in link_ids:
        errors.append(f"measurement {measurement.id}: element_id '{measurement.element_id}' does not reference a link")
    return MeasurementInput(
        id=measurement.id,
        element_id=measurement.element_id,
        element_kind=measurement.element_type.value,
        measurement_type=measurement.measurement_type.value,
        value=measurement.value,
        unit=measurement.unit,
        timestamp=measurement.timestamp,
        entered_at=measurement.entered_at,
    )
