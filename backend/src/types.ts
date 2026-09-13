export type NodeType = "JUNCTION" | "RESERVOIR" | "TANK";
export type LinkType = "PIPE" | "PUMP" | "VALVE" | "FILTER";
export type ElementKind = "NODE" | "LINK";
export type MeasurementType = "PRESSURE_HEAD" | "FLOW_RATE";

export type Point = {
  x: number;
  y: number;
};

export type ElementPayload = {
  id: string;
  label: string;
  type: string;
  input_params?: Record<string, unknown>;
  computed?: Record<string, unknown>;
};

export type NodePayload = ElementPayload & {
  type: NodeType;
  x: number;
  y: number;
};

export type LinkPayload = ElementPayload & {
  type: LinkType;
  from_node_id?: string | null;
  to_node_id?: string | null;
  points?: Point[];
};

export type MeasurementPayload = {
  id: string;
  element_id: string;
  element_type: ElementKind;
  measurement_type: MeasurementType;
  value: number;
  unit: string;
  timestamp?: string | null;
  entered_at?: string;
};

export type SchematicPayload = {
  name: string;
  nodes?: NodePayload[];
  links?: LinkPayload[];
  measurements?: MeasurementPayload[];
  canvas_state?: {
    zoom: number;
    pan: Point;
  };
  thresholds?: {
    threshold_pressure_pct: number;
    threshold_pressure_abs: number;
    threshold_flow_pct: number;
    threshold_flow_abs: number;
  };
  filter_multipliers?: {
    clean: number;
    partially_clogged: number;
    clogged: number;
  };
  styling?: {
    line_color: string;
    line_thickness: number;
    symbol_size: number;
  };
  visibility?: {
    length: boolean;
    diameter: boolean;
    pressure: boolean;
    flow: boolean;
    elevation: boolean;
  };
};

export type SchematicDocument = Required<SchematicPayload> & {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

export type SchematicSummary = {
  id: string;
  name: string;
  updated_at: string;
};

export type SimulationStatus = "success" | "non_convergence" | "validation_error";

export type NodeResult = {
  id: string;
  pressure_head?: number | null;
  actual_demand?: number | null;
  outflow?: number | null;
  hydraulic_head?: number | null;
  current_volume?: number | null;
};

export type LinkResult = {
  id: string;
  flow_rate?: number | null;
  velocity?: number | null;
  headloss?: number | null;
  unit_headloss?: number | null;
  head_added?: number | null;
  energy?: number | null;
  pressure_drop?: number | null;
};

export type SimulationResult = {
  status: SimulationStatus;
  node_results: NodeResult[];
  link_results: LinkResult[];
  iterations: number;
  max_head_error: number;
  max_flow_error: number;
  warnings: string[];
};

export type SimulationPayload = {
  name?: string;
  schematic_id?: string;
  nodes?: NodePayload[];
  links?: LinkPayload[];
  measurements?: MeasurementPayload[];
  input_params?: Record<string, unknown>;
  thresholds?: SchematicPayload["thresholds"];
};

export type AnomalyMeasurementInput = {
  element_id: string;
  type: MeasurementType;
  value: number;
};

export type FlaggedPoint = {
  element_id: string;
  type: MeasurementType;
  expected: number;
  actual: number;
  residual: number;
};

export type SuspectSegment = {
  from: string;
  to: string;
  confidence: number;
  signature: "LEAK" | "BLOCKAGE" | "UNKNOWN";
  pipe_ids: string[];
  length_m: number;
};

export type AnomalyPayload = {
  schematic_id?: string;
  measurements: AnomalyMeasurementInput[];
  nodes?: NodePayload[];
  links?: LinkPayload[];
  thresholds?: SchematicPayload["thresholds"];
};

export type AnomalyResult = {
  flagged_points: FlaggedPoint[];
  suspect_segments: SuspectSegment[];
  warnings: string[];
};

export type AuditLogEntry = {
  timestamp: string;
  user_id: string;
  schematic_id?: string;
  network_size: number;
  status: "SUCCESS" | "FAILED";
};
