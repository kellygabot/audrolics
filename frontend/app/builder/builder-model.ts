// A schematic is a directed graph: nodes are endpoints and links join two nodes.
// Design inputs and simulation outputs stay in separate fields so a simulation
// cannot silently overwrite values entered by an engineer.
export type NodeType = "JUNCTION" | "RESERVOIR" | "TANK";
export type LinkType = "PIPE" | "PUMP" | "VALVE" | "FILTER";
export type ToolType = NodeType | LinkType;
export type Selection = { kind: "node"; id: string } | { kind: "link"; id: string };
export type FieldValue = string | number | CurvePoint[] | undefined;
export type InputParams = Record<string, FieldValue>;
export type ComputedValues = Record<string, number | null>;

export type BuilderNode = {
  id: string;
  label: string;
  type: NodeType;
  x: number;
  y: number;
  input_params: InputParams;
  computed: ComputedValues;
};

export type BuilderLink = {
  id: string;
  label: string;
  type: LinkType;
  from_node_id: string | null;
  to_node_id: string | null;
  points: { x: number; y: number }[];
  input_params: InputParams;
  computed: ComputedValues;
};

export type CurvePoint = {
  flow: string;
  head?: string;
  headloss?: string;
};

export type Measurement = {
  id: string;
  element_id: string;
  element_type: "NODE" | "LINK";
  measurement_type: "PRESSURE_HEAD" | "FLOW_RATE";
  value: number;
  unit: string;
};

export type SchematicModel = {
  id?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  name: string;
  nodes: BuilderNode[];
  links: BuilderLink[];
  measurements: Measurement[];
  canvas_state: { zoom: number; pan: { x: number; y: number } };
  thresholds: {
    threshold_pressure_pct: number;
    threshold_pressure_abs: number;
    threshold_flow_pct: number;
    threshold_flow_abs: number;
  };
  filter_multipliers: {
    clean: number;
    partially_clogged: number;
    clogged: number;
  };
  styling: { line_color: string; line_thickness: number; symbol_size: number };
  visibility: {
    length: boolean;
    diameter: boolean;
    pressure: boolean;
    flow: boolean;
    elevation: boolean;
  };
};

// Undo/redo stores whole schematic snapshots because Feature 1 edits are small,
// and this keeps graph operations such as copy/delete/connect easy to reverse.
export type HistoryState = {
  past: SchematicModel[];
  future: SchematicModel[];
};

export type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

export type DragState =
  | {
    kind: "node";
    id: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  }
  | { kind: "select"; pointerId: number; start: Point; current: Point };

export type Point = { x: number; y: number };
export type ContextMenuState = { x: number; y: number; selection: Selection } | null;

export type NavigationGuardState =
  | { kind: "new" }
  | { kind: "load"; id: string }
  | { kind: "navigate"; href: string }
  | null;

// Keep defaults in one place so New, delete, recovery, and initial render all
// begin with the same valid empty-document shape.
export const defaultModel = (): SchematicModel => ({
  name: "Untitled schematic",
  nodes: [],
  links: [],
  measurements: [],
  canvas_state: { zoom: 100, pan: { x: 0, y: 0 } },
  thresholds: {
    threshold_pressure_pct: 5,
    threshold_pressure_abs: 0.5,
    threshold_flow_pct: 10,
    threshold_flow_abs: 0.5,
  },
  filter_multipliers: { clean: 1, partially_clogged: 3, clogged: 10 },
  styling: { line_color: "#000000", line_thickness: 2, symbol_size: 1 },
  visibility: {
    length: true,
    diameter: true,
    pressure: true,
    flow: true,
    elevation: true,
  },
});

export const MIN_ZOOM = 50;
export const MAX_ZOOM = 200;
export const ZOOM_STEP = 10;
export const SNAP_PX = 10;
export const HISTORY_LIMIT = 60;

export const isNodeTool = (tool: ToolType | null): tool is NodeType =>
  tool === "JUNCTION" || tool === "RESERVOIR" || tool === "TANK";

export const isLinkTool = (tool: ToolType | null): tool is LinkType =>
  tool === "PIPE" || tool === "PUMP" || tool === "VALVE" || tool === "FILTER";

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
export const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
