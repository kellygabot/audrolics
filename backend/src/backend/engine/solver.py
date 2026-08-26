"""
Hydraulic solver boundary.

Input flow:
    saved schematic from API/database
      -> backend.engine.inputs.build_physics_input(...)
      -> PhysicsNetworkInput
      -> solve_network(...)

Output flow:
    solve_network(...)
      -> SolverResult
      -> future API route maps node_results/link_results into schematic
         computed fields and anomaly detection inputs.

Keep the solver pure:
    - Do not read from MongoDB here.
    - Do not call FastAPI here.
    - Do not mutate the saved schematic here.
    - Do not parse raw dictionaries here.
    - Use SRS/UI units at this boundary unless a helper explicitly says it
      converts units internally.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, TypeAlias

from backend.engine.inputs import PhysicsNetworkInput


SolverStatus: TypeAlias = Literal["CONVERGED", "NON_CONVERGED", "FAILED"]


@dataclass(frozen=True)
class SolverWarning:
    # Stable machine-readable warning code, for example E100 or E300.
    code: str
    # Human-readable explanation that can be shown in API responses or logs.
    message: str
    # Optional schematic element id related to the warning.
    element_id: str | None = None
    # Optional attribute name related to the warning.
    attribute: str | None = None


@dataclass(frozen=True)
class SolverError:
    # Stable machine-readable error code, for example E100 or E203.
    code: str
    # Human-readable explanation that can be shown in API responses or logs.
    message: str
    # Optional schematic element id related to the error.
    element_id: str | None = None
    # Optional attribute name related to the error.
    attribute: str | None = None


@dataclass(frozen=True)
class NodeHydraulicResult:
    # Stable node id from the solved schematic.
    node_id: str
    # User-facing label such as J-1, R-1, or T-1.
    label: str
    # Node type from the solved schematic.
    node_type: Literal["JUNCTION", "RESERVOIR", "TANK"]
    # Solved hydraulic grade/head at the node. Unit: meters.
    hydraulic_head_m: float | None = None
    # Solved pressure head above node elevation. Unit: meters.
    pressure_head_m: float | None = None
    # Demand actually supplied at a junction. Unit: L/s.
    actual_demand_lps: float | None = None
    # Net source outflow for reservoirs. Unit: L/s.
    outflow_lps: float | None = None
    # Current tank volume computed from level and diameter. Unit: m^3.
    current_volume_m3: float | None = None


@dataclass(frozen=True)
class LinkHydraulicResult:
    # Stable link id from the solved schematic.
    link_id: str
    # User-facing label such as P-1, PU-1, V-1, or F-1.
    label: str
    # Link type from the solved schematic.
    link_type: Literal["PIPE", "PUMP", "VALVE", "FILTER"]
    # Signed flow following from_node_id -> to_node_id. Unit: L/s.
    flow_lps: float | None = None
    # Mean water velocity through the link. Unit: m/s.
    velocity_mps: float | None = None
    # Head lost across a pipe/filter or other lossy link. Unit: meters.
    headloss_m: float | None = None
    # Headloss divided by link length. Unit: m/m.
    unit_headloss_m_per_m: float | None = None
    # Head added by a pump. Unit: meters.
    head_added_m: float | None = None
    # Pressure/head drop across a valve. Unit: meters.
    pressure_drop_m: float | None = None
    # Pump energy estimate for the solved snapshot. Unit: kWh.
    energy_kwh: float | None = None


@dataclass(frozen=True)
class SolverDiagnostics:
    # Number of solver iterations completed.
    iterations: int = 0
    # Final node mass-balance residual. Unit: L/s.
    max_node_imbalance_lps: float | None = None
    # Final link/head residual. Unit: meters.
    max_link_imbalance_m: float | None = None
    # Final head-correction vector norm. Unit: meters.
    head_correction_l2_m: float | None = None
    # True when the solver stopped because residuals met tolerance.
    converged: bool = False


@dataclass(frozen=True)
class SolverResult:
    # Overall solver status.
    status: SolverStatus
    # Per-node hydraulic results keyed by schematic node id.
    node_results: dict[str, NodeHydraulicResult] = field(default_factory=dict)
    # Per-link hydraulic results keyed by schematic link id.
    link_results: dict[str, LinkHydraulicResult] = field(default_factory=dict)
    # Iteration and residual details useful for debugging and audit logs.
    diagnostics: SolverDiagnostics = field(default_factory=SolverDiagnostics)
    # Non-fatal issues discovered while solving.
    warnings: tuple[SolverWarning, ...] = ()
    # Fatal issues when status is FAILED.
    errors: tuple[SolverError, ...] = ()


def solve_network(network: PhysicsNetworkInput) -> SolverResult:
    """Solve one steady-state hydraulic snapshot.

    This is the function the future simulation API should call after it has
    loaded a saved schematic and converted it with build_physics_input().

    1. Validate graph feasibility using the already-built indexes on `network`.
       Example fields:
       - network.nodes_by_id
       - network.links_by_id
       - network.incident_link_ids_by_node_id
       - network.link_endpoint_node_ids_by_link_id
       - network.source_node_ids

    2. Initialize unknown hydraulic heads and link flows.
       Reservoirs and tanks are source/head boundary nodes. Junction heads and
       link flows are the main unknowns for the steady-state solve.

    3. Apply element equations.
       Start with pipes:
       - convert pipe diameter from mm to m inside formula helpers
       - convert flow from L/s to m^3/s inside formula helpers
       - compute velocity, Hazen-Williams headloss, minor losses, and unit
         headloss

    4. Iterate until SRS convergence tolerances are met.
       Target tolerances from the SRS:
       - node imbalance <= 0.001 L/s
       - link/head imbalance <= 0.001 m
       - maximum iterations = 200
       - abort if correction norm grows for 5 consecutive iterations

    5. Return SolverResult.
       Put final values in:
       - SolverResult.node_results[node_id]
       - SolverResult.link_results[link_id]
       - SolverResult.diagnostics
       - SolverResult.warnings for non-fatal issues
       - SolverResult.errors for fatal failures

    For now this returns an explicit FAILED result so an API can call it without
    pretending simulation is implemented.
    """

    return SolverResult(
        status="FAILED",
        diagnostics=SolverDiagnostics(converged=False),
        errors=(
            SolverError(
                code="E100",
                message="Hydraulic solver is not implemented yet.",
            ),
        ),
    )
