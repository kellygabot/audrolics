import type {
  LinkPayload,
  MeasurementPayload,
  NodePayload,
  Point,
  SchematicPayload,
} from "../types.js";
import { utcNowIso } from "../utils/time.js";

const NODE_TYPES = new Set(["JUNCTION", "RESERVOIR", "TANK"]);
const LINK_TYPES = new Set(["PIPE", "PUMP", "VALVE", "FILTER"]);
const ELEMENT_KINDS = new Set(["NODE", "LINK"]);
const MEASUREMENT_TYPES = new Set(["PRESSURE_HEAD", "FLOW_RATE"]);

export class ValidationError extends Error {
  issues: string[];

  constructor(issues: string[]) {
    super(issues.join("; "));
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export const normalizeSchematicPayload = (body: unknown): SchematicPayload => {
  if (!isRecord(body)) throw new ValidationError(["E200 payload must be an object"]);

  const payload: SchematicPayload = {
    name: requireString(body, "name"),
    nodes: normalizeNodes(body.nodes),
    links: normalizeLinks(body.links),
    measurements: normalizeMeasurements(body.measurements),
    canvas_state: normalizeCanvasState(body.canvas_state),
    thresholds: normalizeThresholds(body.thresholds),
    filter_multipliers: normalizeFilterMultipliers(body.filter_multipliers),
    styling: normalizeStyling(body.styling),
    visibility: normalizeVisibility(body.visibility),
  };

  validateSchematic(payload);
  return payload;
};

const normalizeNodes = (value: unknown): NodePayload[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError(["E200 nodes must be an array"]);

  return value.map((node) => {
    if (!isRecord(node)) throw new ValidationError(["E200 node must be an object"]);
    const type = requireString(node, "type");
    if (!NODE_TYPES.has(type)) throw new ValidationError([`E200 node type must be one of ${[...NODE_TYPES].join(", ")}`]);
    return {
      id: requireString(node, "id"),
      label: requireString(node, "label"),
      type: type as NodePayload["type"],
      x: requireNumber(node, "x"),
      y: requireNumber(node, "y"),
      input_params: normalizeNodeInputParams(type, node.input_params),
      computed: normalizeNodeComputed(type, node.computed),
    };
  });
};

const normalizeLinks = (value: unknown): LinkPayload[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError(["E200 links must be an array"]);

  return value.map((link) => {
    if (!isRecord(link)) throw new ValidationError(["E200 link must be an object"]);
    const type = requireString(link, "type");
    if (!LINK_TYPES.has(type)) throw new ValidationError([`E200 link type must be one of ${[...LINK_TYPES].join(", ")}`]);
    return {
      id: requireString(link, "id"),
      label: requireString(link, "label"),
      type: type as LinkPayload["type"],
      from_node_id: optionalString(link.from_node_id),
      to_node_id: optionalString(link.to_node_id),
      points: normalizePoints(link.points),
      input_params: normalizeLinkInputParams(type, link.input_params),
      computed: normalizeLinkComputed(type, link.computed),
    };
  });
};

const normalizeMeasurements = (value: unknown): MeasurementPayload[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError(["E200 measurements must be an array"]);

  return value.map((measurement) => {
    if (!isRecord(measurement)) throw new ValidationError(["E200 measurement must be an object"]);
    const elementType = requireString(measurement, "element_type");
    const measurementType = requireString(measurement, "measurement_type");
    if (!ELEMENT_KINDS.has(elementType)) throw new ValidationError(["E200 measurement element_type must be NODE or LINK"]);
    if (!MEASUREMENT_TYPES.has(measurementType)) {
      throw new ValidationError(["E200 measurement_type must be PRESSURE_HEAD or FLOW_RATE"]);
    }
    return {
      id: requireString(measurement, "id"),
      element_id: requireString(measurement, "element_id"),
      element_type: elementType as MeasurementPayload["element_type"],
      measurement_type: measurementType as MeasurementPayload["measurement_type"],
      value: requireNumber(measurement, "value"),
      unit: requireString(measurement, "unit"),
      timestamp: optionalString(measurement.timestamp),
      entered_at: optionalString(measurement.entered_at) ?? utcNowIso(),
    };
  });
};

const normalizePoints = (value: unknown): Point[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError(["E200 points must be an array"]);
  return value.map((point) => {
    if (!isRecord(point)) throw new ValidationError(["E200 point must be an object"]);
    return { x: requireNumber(point, "x"), y: requireNumber(point, "y") };
  });
};

const normalizeCanvasState = (value: unknown): SchematicPayload["canvas_state"] => {
  if (value === undefined) return { zoom: 100, pan: { x: 0, y: 0 } };
  if (!isRecord(value) || !isRecord(value.pan)) throw new ValidationError(["E200 canvas_state must include pan"]);
  return {
    zoom: requireNumber(value, "zoom"),
    pan: { x: requireNumber(value.pan, "x"), y: requireNumber(value.pan, "y") },
  };
};

const normalizeThresholds = (value: unknown): SchematicPayload["thresholds"] => {
  if (value === undefined) {
    return {
      threshold_pressure_pct: 5,
      threshold_pressure_abs: 0.5,
      threshold_flow_pct: 10,
      threshold_flow_abs: 0.5,
    };
  }
  if (!isRecord(value)) throw new ValidationError(["E200 thresholds must be an object"]);
  return {
    threshold_pressure_pct: requireNumber(value, "threshold_pressure_pct"),
    threshold_pressure_abs: requireNumber(value, "threshold_pressure_abs"),
    threshold_flow_pct: requireNumber(value, "threshold_flow_pct"),
    threshold_flow_abs: requireNumber(value, "threshold_flow_abs"),
  };
};

const normalizeFilterMultipliers = (value: unknown): SchematicPayload["filter_multipliers"] => {
  if (value === undefined) return { clean: 1, partially_clogged: 3, clogged: 10 };
  if (!isRecord(value)) throw new ValidationError(["E200 filter_multipliers must be an object"]);
  return {
    clean: requireNumber(value, "clean"),
    partially_clogged: requireNumber(value, "partially_clogged"),
    clogged: requireNumber(value, "clogged"),
  };
};

const normalizeStyling = (value: unknown): SchematicPayload["styling"] => {
  if (value === undefined) return { line_color: "#0f766e", line_thickness: 2, symbol_size: 1 };
  if (!isRecord(value)) throw new ValidationError(["E200 styling must be an object"]);
  return {
    line_color: requireString(value, "line_color"),
    line_thickness: requireNumber(value, "line_thickness"),
    symbol_size: requireNumber(value, "symbol_size"),
  };
};

const normalizeVisibility = (value: unknown): SchematicPayload["visibility"] => {
  if (value === undefined) {
    return { length: true, diameter: true, pressure: true, flow: true, elevation: true };
  }
  if (!isRecord(value)) throw new ValidationError(["E200 visibility must be an object"]);
  return {
    length: requireBoolean(value, "length"),
    diameter: requireBoolean(value, "diameter"),
    pressure: requireBoolean(value, "pressure"),
    flow: requireBoolean(value, "flow"),
    elevation: requireBoolean(value, "elevation"),
  };
};

const normalizeNodeInputParams = (type: string, value: unknown): Record<string, unknown> => {
  const params = asParams(value);
  if (type === "JUNCTION") {
    return {
      elevation: requireNumber(params, "elevation"),
      base_demand: requireNumber(params, "base_demand"),
      ...(params.demand_pattern === undefined ? {} : { demand_pattern: optionalString(params.demand_pattern) }),
    };
  }
  if (type === "RESERVOIR") return { total_head: requireNumber(params, "total_head") };
  return {
    elevation: requireNumber(params, "elevation"),
    diameter: requireNumber(params, "diameter"),
    min_level: requireNumber(params, "min_level"),
    max_level: requireNumber(params, "max_level"),
    initial_level: requireNumber(params, "initial_level"),
  };
};

const normalizeLinkInputParams = (type: string, value: unknown): Record<string, unknown> => {
  const params = asParams(value);
  if (type === "PIPE") {
    return {
      length: requireNumber(params, "length"),
      diameter: requireNumber(params, "diameter"),
      roughness: params.roughness === undefined ? 140 : requireNumber(params, "roughness"),
      minor_loss_coeff: params.minor_loss_coeff === undefined ? 0 : requireNumber(params, "minor_loss_coeff"),
      status: params.status === undefined ? "OPEN" : requireString(params, "status"),
    };
  }
  if (type === "PUMP") {
    return {
      ...(params.rated_power === undefined ? {} : { rated_power: requireNumber(params, "rated_power") }),
      speed: requireNumber(params, "speed"),
      status: requireString(params, "status"),
      pump_curve: normalizeCurve(params.pump_curve, "head"),
    };
  }
  if (type === "VALVE") {
    return {
      valve_type: requireString(params, "valve_type"),
      diameter: requireNumber(params, "diameter"),
      ...(params.valve_setting === undefined ? {} : { valve_setting: requireNumber(params, "valve_setting") }),
      status: requireString(params, "status"),
      gpv_curve: normalizeCurve(params.gpv_curve, "headloss"),
    };
  }
  return {
    mesh_size: requireNumber(params, "mesh_size"),
    minor_loss_coeff: requireNumber(params, "minor_loss_coeff"),
    filter_status: requireString(params, "filter_status"),
  };
};

const normalizeNodeComputed = (type: string, value: unknown): Record<string, unknown> => {
  const computed = isRecord(value) ? value : {};
  if (type === "JUNCTION") {
    return { pressure_head: nullableNumber(computed.pressure_head), actual_demand: nullableNumber(computed.actual_demand) };
  }
  if (type === "RESERVOIR") return { outflow: nullableNumber(computed.outflow) };
  return { hydraulic_head: nullableNumber(computed.hydraulic_head), current_volume: nullableNumber(computed.current_volume) };
};

const normalizeLinkComputed = (type: string, value: unknown): Record<string, unknown> => {
  const computed = isRecord(value) ? value : {};
  if (type === "PIPE") {
    return {
      flow_rate: nullableNumber(computed.flow_rate),
      velocity: nullableNumber(computed.velocity),
      headloss: nullableNumber(computed.headloss),
      unit_headloss: nullableNumber(computed.unit_headloss),
    };
  }
  if (type === "PUMP") {
    return { flow: nullableNumber(computed.flow), head_added: nullableNumber(computed.head_added), energy: nullableNumber(computed.energy) };
  }
  if (type === "VALVE") {
    return { flow: nullableNumber(computed.flow), pressure_drop: nullableNumber(computed.pressure_drop) };
  }
  return { headloss: nullableNumber(computed.headloss) };
};

const validateSchematic = (payload: SchematicPayload) => {
  const errors: string[] = [];
  const nodes = payload.nodes ?? [];
  const links = payload.links ?? [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const linkIds = new Set(links.map((link) => link.id));

  requireUnique(nodes.map((node) => node.id), "Node ids", errors);
  requireUnique(nodes.map((node) => node.label), "Node labels", errors);
  requireUnique(links.map((link) => link.id), "Link ids", errors);
  requireUnique(links.map((link) => link.label), "Link labels", errors);

  for (const node of nodes) validateNode(node, errors);
  for (const link of links) validateLink(link, nodeIds, errors);
  for (const measurement of payload.measurements ?? []) validateMeasurement(measurement, nodeIds, linkIds, errors);

  if (errors.length > 0) throw new ValidationError(errors);
};

const validateNode = (node: NodePayload, errors: string[]) => {
  const params = node.input_params ?? {};
  if (node.type === "JUNCTION") {
    requireRange(node.label, params, "elevation", -100, 5000, errors);
    requireRange(node.label, params, "base_demand", 0, undefined, errors);
  } else if (node.type === "RESERVOIR") {
    requireRange(node.label, params, "total_head", -100, 5000, errors);
  } else {
    requireRange(node.label, params, "elevation", -100, 5000, errors);
    requireRange(node.label, params, "diameter", 0, undefined, errors, true);
    requireRange(node.label, params, "min_level", 0, undefined, errors);
    requireRange(node.label, params, "max_level", 0, undefined, errors);
    requireRange(node.label, params, "initial_level", 0, undefined, errors);
    const min = params.min_level;
    const initial = params.initial_level;
    const max = params.max_level;
    if (isNumber(min) && isNumber(initial) && isNumber(max) && !(min <= initial && initial <= max)) {
      errors.push(`E202 ${node.label}: min_level <= initial_level <= max_level is required`);
    }
  }
};

const validateLink = (link: LinkPayload, nodeIds: Set<string>, errors: string[]) => {
  const params = link.input_params ?? {};
  if (!link.from_node_id || !link.to_node_id) errors.push(`E102 ${link.label}: both link endpoints must be connected`);
  if (link.from_node_id && !nodeIds.has(link.from_node_id)) errors.push(`E102 ${link.label}: from_node_id does not reference a node`);
  if (link.to_node_id && !nodeIds.has(link.to_node_id)) errors.push(`E102 ${link.label}: to_node_id does not reference a node`);

  if (link.type === "PIPE") {
    requireRange(link.label, params, "length", 0, 100000, errors, true);
    requireRange(link.label, params, "diameter", 0, undefined, errors, true);
    requireRange(link.label, params, "roughness", 1, 150, errors);
    requireRange(link.label, params, "minor_loss_coeff", 0, undefined, errors);
    requireChoice(link.label, params, "status", ["OPEN", "CLOSED"], errors);
  } else if (link.type === "PUMP") {
    requireChoice(link.label, params, "status", ["ON", "OFF"], errors);
    requireRange(link.label, params, "speed", 0, undefined, errors, true);
    const curve = params.pump_curve;
    const ratedPower = params.rated_power;
    if (Array.isArray(curve) && curve.length > 0) validateCurve(link.label, curve, "pump_curve", "head", errors);
    else if (!isNumber(ratedPower) || ratedPower <= 0) errors.push(`E200 ${link.label}: pump_curve or rated_power > 0 is required`);
  } else if (link.type === "VALVE") {
    requireChoice(link.label, params, "status", ["OPEN", "CLOSED", "ACTIVE"], errors);
    requireChoice(link.label, params, "valve_type", ["PRV", "PSV", "PBV", "FCV", "TCV", "GPV"], errors);
    requireRange(link.label, params, "diameter", 0, undefined, errors, true);
    if (params.valve_type === "GPV") validateCurve(link.label, params.gpv_curve, "gpv_curve", "headloss", errors);
    else requireRange(link.label, params, "valve_setting", 0, undefined, errors, true);
  } else {
    requireRange(link.label, params, "mesh_size", 0, undefined, errors, true);
    requireRange(link.label, params, "minor_loss_coeff", 0, undefined, errors);
    requireChoice(link.label, params, "filter_status", ["CLEAN", "PARTIALLY_CLOGGED", "CLOGGED"], errors);
  }
};

const validateMeasurement = (
  measurement: MeasurementPayload,
  nodeIds: Set<string>,
  linkIds: Set<string>,
  errors: string[],
) => {
  if (measurement.element_type === "NODE") {
    if (!nodeIds.has(measurement.element_id)) errors.push(`E200 measurement ${measurement.id}: element_id must reference a node`);
    if (measurement.measurement_type !== "PRESSURE_HEAD") errors.push(`E200 measurement ${measurement.id}: node measurements must use PRESSURE_HEAD`);
  }
  if (measurement.element_type === "LINK") {
    if (!linkIds.has(measurement.element_id)) errors.push(`E200 measurement ${measurement.id}: element_id must reference a link`);
    if (measurement.measurement_type !== "FLOW_RATE") errors.push(`E200 measurement ${measurement.id}: link measurements must use FLOW_RATE`);
  }
};

const requireUnique = (values: string[], name: string, errors: string[]) => {
  if (values.length !== new Set(values).size) errors.push(`${name} must be unique.`);
};

const requireRange = (
  label: string,
  params: Record<string, unknown>,
  key: string,
  minimum: number | undefined,
  maximum: number | undefined,
  errors: string[],
  exclusiveMin = false,
) => {
  const value = params[key];
  if (!isNumber(value)) {
    errors.push(`E200 ${label}: ${key} must be a number`);
    return;
  }
  if (minimum !== undefined && (exclusiveMin ? value <= minimum : value < minimum)) {
    errors.push(`E200 ${label}: ${key} must be ${exclusiveMin ? ">" : ">="} ${minimum}`);
  }
  if (maximum !== undefined && value > maximum) errors.push(`E200 ${label}: ${key} must be <= ${maximum}`);
};

const requireChoice = (
  label: string,
  params: Record<string, unknown>,
  key: string,
  choices: string[],
  errors: string[],
) => {
  if (!choices.includes(String(params[key]))) errors.push(`E200 ${label}: ${key} must be one of ${choices.join(", ")}`);
};

const normalizeCurve = (value: unknown, yKey: "head" | "headloss") => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError(["E201 curve must be an array"]);
  return value.map((point) => {
    if (!isRecord(point)) throw new ValidationError(["E201 curve point must be an object"]);
    return { flow: requireNumber(point, "flow"), [yKey]: requireNumber(point, yKey) };
  });
};

const validateCurve = (
  label: string,
  curve: unknown,
  key: string,
  yKey: "head" | "headloss",
  errors: string[],
) => {
  if (!Array.isArray(curve) || curve.length < 2) {
    errors.push(`E201 ${label}: ${key} requires at least 2 points`);
    return;
  }
  const flows = curve.map((point) => (isRecord(point) ? point.flow : undefined));
  const values = curve.map((point) => (isRecord(point) ? point[yKey] : undefined));
  if (!flows.every(isNumber) || !values.every(isNumber)) {
    errors.push(`E201 ${label}: ${key} points require flow and ${yKey} numbers`);
    return;
  }
  if (flows.length !== new Set(flows).size) errors.push(`E201 ${label}: ${key} cannot contain duplicate flow values`);
  if (JSON.stringify(flows) !== JSON.stringify([...flows].sort((a, b) => a - b))) {
    errors.push(`E201 ${label}: ${key} flow values must increase`);
  }
  if (yKey === "head" && values.some((value, index) => index < values.length - 1 && value <= values[index + 1])) {
    errors.push(`E201 ${label}: pump head must decrease as flow increases`);
  }
  if (yKey === "headloss" && values.some((value, index) => index < values.length - 1 && value >= values[index + 1])) {
    errors.push(`E201 ${label}: GPV headloss must increase as flow increases`);
  }
};

const asParams = (value: unknown) => {
  if (!isRecord(value)) throw new ValidationError(["E200 input_params must be an object"]);
  return value;
};

const requireString = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError([`E200 ${key} must be a non-empty string`]);
  }
  return value;
};

const optionalString = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ValidationError(["E200 optional value must be a string"]);
  return value;
};

const requireNumber = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  if (!isNumber(value)) throw new ValidationError([`E200 ${key} must be a number`]);
  return value;
};

const requireBoolean = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  if (typeof value !== "boolean") throw new ValidationError([`E200 ${key} must be a boolean`]);
  return value;
};

const nullableNumber = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (!isNumber(value)) throw new ValidationError(["E200 computed value must be a number or null"]);
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
