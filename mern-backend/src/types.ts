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
