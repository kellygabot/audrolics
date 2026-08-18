export type CurvePoint = {
  flow: string | number;
  head?: string | number;
  headloss?: string | number;
};

export type FieldValue = string | number | CurvePoint[] | undefined;

export type FieldDef =
  | { key: string; label: string; kind: "number" | "text"; unit?: string }
  | { key: string; label: string; kind: "select"; options: string[] }
  | { key: string; label: string; kind: "curve"; yKey: "head" | "headloss" };

export type FitNode = { x: number; y: number };
export type CanvasState = { zoom: number; pan: { x: number; y: number } };

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;

const numericFieldRules: Record<string, { min?: number; max?: number; greaterThan?: number; message: string }> = {
  elevation: { min: -100, max: 5000, message: "Elevation must be between -100 m and 5000 m." },
  total_head: { min: -100, max: 5000, message: "Total head must be between -100 m and 5000 m." },
  base_demand: { min: 0, message: "Base demand must be 0 L/s or greater." },
  length: { greaterThan: 0, max: 100000, message: "Length must be greater than 0 m and no more than 100000 m." },
  diameter: { greaterThan: 0, message: "Diameter must be greater than 0." },
  roughness: { min: 1, max: 150, message: "Roughness C-factor must be between 1 and 150." },
  minor_loss_coeff: { min: 0, message: "Minor loss coefficient must be 0 or greater." },
  min_level: { min: 0, message: "Min level must be 0 m or greater." },
  max_level: { min: 0, message: "Max level must be 0 m or greater." },
  initial_level: { min: 0, message: "Initial level must be 0 m or greater." },
  speed: { greaterThan: 0, message: "Speed must be greater than 0. Typical values are 0.1 to 2.0." },
  rated_power: { greaterThan: 0, message: "Rated power must be greater than 0 kW." },
  valve_setting: { greaterThan: 0, message: "Setting must be greater than 0. PRV upstream-pressure checks run after simulation is available." },
  mesh_size: { greaterThan: 0, message: "Mesh / screen size must be greater than 0 mm." },
};

export const validateFieldValue = (field: FieldDef, value: FieldValue): string | undefined => {
  if (field.kind === "select") return value ? undefined : `Please choose ${field.label.toLowerCase()}.`;
  if (field.kind === "text") return undefined;
  if (field.kind === "curve") return validateCurve(field, value);

  const parsed = Number(value);
  if (value === "" || value === undefined || !Number.isFinite(parsed)) {
    return `Please enter a number for ${field.label.toLowerCase()}.`;
  }

  const rule = numericFieldRules[field.key];
  if (!rule) return parsed < 0 ? `${field.label} must be 0 or greater.` : undefined;
  if (rule.greaterThan !== undefined && parsed <= rule.greaterThan) return rule.message;
  if (rule.min !== undefined && parsed < rule.min) return rule.message;
  if (rule.max !== undefined && parsed > rule.max) return rule.message;
  return undefined;
};

export const validateCurve = (field: Extract<FieldDef, { kind: "curve" }>, value: FieldValue): string | undefined => {
  const points = Array.isArray(value) ? value : [];
  if (points.length < 2) return `${field.label} needs at least 2 points.`;

  const parsed = points.map((point) => ({ flow: Number(point.flow), y: Number(point[field.yKey]) }));
  if (parsed.some((point) => !Number.isFinite(point.flow) || !Number.isFinite(point.y))) {
    return "Each curve row needs numeric flow and value entries.";
  }

  const flows = new Set<number>();
  for (const point of parsed) {
    if (flows.has(point.flow)) return "Curve flow values cannot repeat.";
    flows.add(point.flow);
  }

  const sorted = [...parsed].sort((a, b) => a.flow - b.flow);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (field.yKey === "head" && current.y >= previous.y) {
      return "Pump head must decrease as flow increases.";
    }
    if (field.yKey === "headloss" && current.y <= previous.y) {
      return "GPV headloss must increase as flow increases.";
    }
  }

  return undefined;
};

export const validateTankLevels = (params: Record<string, FieldValue>): string | undefined => {
  const min = Number(params.min_level);
  const initial = Number(params.initial_level);
  const max = Number(params.max_level);
  if (![min, initial, max].every(Number.isFinite)) return undefined;
  return min <= initial && initial <= max ? undefined : "Tank levels must follow 0 <= min <= initial <= max.";
};

export const fitToView = (
  nodes: FitNode[],
  viewport: { width: number; height: number },
  padding = 80,
): CanvasState => {
  if (nodes.length === 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { zoom: 100, pan: { x: 0, y: 0 } };
  }

  const minX = Math.min(...nodes.map((node) => node.x));
  const maxX = Math.max(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxY = Math.max(...nodes.map((node) => node.y));
  const contentWidth = Math.max(maxX - minX, 1);
  const contentHeight = Math.max(maxY - minY, 1);
  const availableWidth = Math.max(viewport.width - padding * 2, 1);
  const availableHeight = Math.max(viewport.height - padding * 2, 1);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.floor(Math.min(availableWidth / contentWidth, availableHeight / contentHeight) * 100)));
  const scale = zoom / 100;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    zoom,
    pan: {
      x: viewport.width / 2 - centerX * scale,
      y: viewport.height / 2 - centerY * scale,
    },
  };
};
