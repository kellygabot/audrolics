import { validateFieldValue, validateTankLevels } from "@/lib/builder-rules";
import { defaultModel, isNodeTool, type NodeType, type LinkType, type ToolType, type InputParams, type ComputedValues, type FieldValue, type SchematicModel, type BuilderLink, type BuilderNode, type Selection, type Point } from "./builder-model";

export type FieldDef =
  | { key: string; label: string; kind: "number" | "text"; unit?: string }
  | { key: string; label: string; kind: "select"; options: string[] }
  | { key: string; label: string; kind: "curve"; yKey: "head" | "headloss" };

// Field definitions determine both the controls shown in the inspector and
// their labels/units; the underlying model still stores plain input_params.
export function fieldsForType(
  type: NodeType | LinkType,
  params: InputParams,
): FieldDef[] {
  // This is the frontend mirror of SRS Section 3.1. The backend validates the
  // same concepts before running analysis.
  if (type === "JUNCTION")
    return [
      { key: "elevation", label: "Elevation", kind: "number", unit: "m" },
      { key: "base_demand", label: "Base Demand", kind: "number", unit: "L/s" },
      { key: "demand_pattern", label: "Demand Pattern", kind: "text" },
    ];
  if (type === "RESERVOIR")
    return [
      {
        key: "total_head",
        label: "Total Head / Elevation",
        kind: "number",
        unit: "m",
      },
    ];
  if (type === "TANK")
    return [
      { key: "elevation", label: "Elevation", kind: "number", unit: "m" },
      { key: "diameter", label: "Diameter", kind: "number", unit: "m" },
      { key: "min_level", label: "Min Level", kind: "number", unit: "m" },
      { key: "max_level", label: "Max Level", kind: "number", unit: "m" },
      {
        key: "initial_level",
        label: "Initial Level",
        kind: "number",
        unit: "m",
      },
    ];
  if (type === "PIPE")
    return [
      { key: "length", label: "Length", kind: "number", unit: "m" },
      { key: "diameter", label: "Diameter", kind: "number", unit: "mm" },
      { key: "roughness", label: "Roughness C-factor", kind: "number" },
      {
        key: "minor_loss_coeff",
        label: "Minor Loss Coefficient",
        kind: "number",
      },
      {
        key: "status",
        label: "Status",
        kind: "select",
        options: ["OPEN", "CLOSED"],
      },
    ];
  if (type === "PUMP")
    return [
      { key: "rated_power", label: "Rated Power", kind: "number", unit: "kW" },
      { key: "speed", label: "Speed", kind: "number" },
      {
        key: "status",
        label: "Status",
        kind: "select",
        options: ["ON", "OFF"],
      },
      { key: "pump_curve", label: "Pump Curve", kind: "curve", yKey: "head" },
    ];
  if (type === "VALVE") {
    const valveType = params.valve_type;
    return [
      {
        key: "valve_type",
        label: "Valve Type",
        kind: "select",
        options: ["PRV", "PSV", "PBV", "FCV", "TCV", "GPV"],
      },
      { key: "diameter", label: "Diameter", kind: "number", unit: "mm" },
      valveType === "GPV"
        ? {
          key: "gpv_curve",
          label: "GPV Headloss Curve",
          kind: "curve",
          yKey: "headloss",
        }
        : { key: "valve_setting", label: "Setting", kind: "number" },
      {
        key: "status",
        label: "Status",
        kind: "select",
        options: ["OPEN", "CLOSED", "ACTIVE"],
      },
    ];
  }
  return [
    {
      key: "mesh_size",
      label: "Mesh / Screen Size",
      kind: "number",
      unit: "mm",
    },
    {
      key: "minor_loss_coeff",
      label: "Minor Loss Coefficient",
      kind: "number",
    },
    {
      key: "filter_status",
      label: "Strainer / Filter Status",
      kind: "select",
      options: ["CLEAN", "PARTIALLY_CLOGGED", "CLOGGED"],
    },
  ];
}

export function defaultNodeParams(type: NodeType): InputParams {
  if (type === "JUNCTION")
    return { elevation: "", base_demand: "", demand_pattern: "" };
  if (type === "RESERVOIR") return { total_head: "" };
  return {
    elevation: "",
    diameter: "",
    min_level: "",
    max_level: "",
    initial_level: "",
  };
}

export function defaultLinkParams(type: LinkType): InputParams {
  if (type === "PIPE")
    return {
      length: "",
      diameter: "",
      roughness: 140,
      minor_loss_coeff: 0,
      status: "OPEN",
    };
  if (type === "PUMP")
    return { rated_power: "", speed: "", status: "", pump_curve: [] };
  if (type === "VALVE")
    return {
      valve_type: "",
      diameter: "",
      valve_setting: "",
      status: "",
      gpv_curve: [],
    };
  return { mesh_size: "", minor_loss_coeff: "", filter_status: "" };
}

export function defaultNodeComputed(type: NodeType): ComputedValues {
  if (type === "JUNCTION") return { pressure_head: null, actual_demand: null };
  if (type === "RESERVOIR") return { outflow: null };
  return { hydraulic_head: null, current_volume: null };
}

export function defaultLinkComputed(type: LinkType): ComputedValues {
  if (type === "PIPE")
    return {
      flow_rate: null,
      velocity: null,
      headloss: null,
      unit_headloss: null,
    };
  if (type === "PUMP") return { flow_rate: null, head_added: null, energy: null };
  if (type === "VALVE") return { flow_rate: null, pressure_drop: null };
  return { flow_rate: null, headloss: null };
}

export function computedForType(type: NodeType | LinkType): ComputedValues {
  return isNodeTool(type)
    ? defaultNodeComputed(type)
    : defaultLinkComputed(type);
}

export function nextLabel(type: ToolType, model: SchematicModel): string {
  const prefix: Record<ToolType, string> = {
    JUNCTION: "J",
    RESERVOIR: "R",
    TANK: "T",
    PIPE: "P",
    PUMP: "PU",
    VALVE: "V",
    FILTER: "F",
  };
  const labels = [
    ...model.nodes.map((node) => node.label),
    ...model.links.map((link) => link.label),
  ];
  let index = 1;
  while (labels.includes(`${prefix[type]}-${index}`)) index += 1;
  return `${prefix[type]}-${index}`;
}

export function validateModel(model: SchematicModel): Record<string, string> {
  // Validation keys are `${elementId}.${field}` so field controls can decide
  // when to reveal their own message.
  const errors: Record<string, string> = {};
  for (const node of model.nodes) {
    for (const field of fieldsForType(node.type, node.input_params)) {
      if (field.kind !== "curve")
        validateField(
          `${node.id}.${field.key}`,
          field,
          node.input_params[field.key],
          errors,
        );
    }
    if (node.type === "TANK") {
      const tankError = validateTankLevels(node.input_params);
      if (tankError) errors[`${node.id}.initial_level`] = tankError;
    }
  }
  for (const link of model.links) {
    if (!link.from_node_id || !link.to_node_id)
      errors[`${link.id}.endpoints`] = "Both endpoints must be connected.";
    for (const field of fieldsForType(link.type, link.input_params)) {
      if (link.type === "PUMP" && (field.key === "rated_power" || field.key === "pump_curve")) continue;
      validateField(
        `${link.id}.${field.key}`,
        field,
        link.input_params[field.key],
        errors,
      );
    }
    if (link.type === "PUMP") {
      const curve = link.input_params.pump_curve;
      const power = link.input_params.rated_power;
      if (Array.isArray(curve) && curve.length > 0) {
        validateField(`${link.id}.pump_curve`, { key: "pump_curve", label: "Pump Curve", kind: "curve", yKey: "head" }, curve, errors);
      } else if (power === "" || power === undefined) {
        errors[`${link.id}.rated_power`] = "Enter rated power or a pump curve.";
      } else {
        validateField(`${link.id}.rated_power`, { key: "rated_power", label: "Rated Power", kind: "number" }, power, errors);
      }
    }
  }
  return errors;
}

function validateField(
  path: string,
  field: FieldDef,
  value: FieldValue,
  errors: Record<string, string>,
) {
  const error = validateFieldValue(field, value);
  if (error) errors[path] = error;
}

export function toApiPayload(model: SchematicModel) {
  // Keep form strings and incomplete curve rows intact when saving drafts.
  return model;
}

export function toAnalysisPayload(model: SchematicModel) {
  return {
    ...model,
    nodes: model.nodes.map((node) => ({
      ...node,
      input_params: normalizeParams(node.input_params),
    })),
    links: model.links.map((link) => ({
      ...link,
      input_params: normalizeParams(link.input_params),
    })),
  };
}

export function fromApiPayload(
  payload: SchematicModel & { id?: string },
): SchematicModel {
  return {
    ...defaultModel(),
    ...payload,
    nodes: payload.nodes ?? [],
    links: payload.links ?? [],
    measurements: payload.measurements ?? [],
  };
}

export function findLinkPath(
  fromNodeId: string,
  toNodeId: string,
  links: BuilderLink[],
): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const link of links) {
    if (!link.from_node_id || !link.to_node_id) continue;
    const list = adjacency.get(link.from_node_id) ?? [];
    list.push(link.id);
    adjacency.set(link.from_node_id, list);
    const reverse = adjacency.get(link.to_node_id) ?? [];
    reverse.push(link.id);
    adjacency.set(link.to_node_id, reverse);
  }
  const visitedNodes = new Set<string>();
  const queue: { nodeId: string; path: string[] }[] = [{ nodeId: fromNodeId, path: [] }];
  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!;
    if (nodeId === toNodeId) return path;
    if (visitedNodes.has(nodeId)) continue;
    visitedNodes.add(nodeId);
    for (const linkId of adjacency.get(nodeId) ?? []) {
      const link = links.find((l) => l.id === linkId);
      if (!link) continue;
      const nextNodeId = link.from_node_id === nodeId ? link.to_node_id : link.from_node_id;
      if (!nextNodeId) continue;
      queue.push({ nodeId: nextNodeId, path: [...path, linkId] });
    }
  }
  return null;
}

export function normalizeParams(params: InputParams): InputParams {
  // Form inputs stay as strings for editing. API payloads convert numeric-looking
  // numeric fields for analysis; text fields such as demand_pattern stay strings.
  const numericKeys = new Set([
    "elevation", "base_demand", "total_head", "diameter", "min_level", "max_level",
    "initial_level", "length", "roughness", "minor_loss_coeff", "rated_power",
    "speed", "valve_setting", "mesh_size",
  ]);
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (Array.isArray(value)) {
        return [
          key,
          value.map((point) =>
            Object.fromEntries(
              Object.entries(point).map(([pointKey, pointValue]) => [
                pointKey,
                pointValue === "" ? undefined : Number(pointValue),
              ]),
            ),
          ),
        ];
      }
      if (
        numericKeys.has(key) && typeof value === "string" &&
        value !== "" &&
        Number.isFinite(Number(value))
      )
        return [key, Number(value)];
      return [key, value];
    }),
  );
}

export function updateLinkPointsForNodes(links: BuilderLink[], nodes: BuilderNode[]) {
  return links.map((link) => {
    const from = nodes.find((node) => node.id === link.from_node_id);
    const to = nodes.find((node) => node.id === link.to_node_id);
    return from && to
      ? {
        ...link,
        points: [
          { x: from.x, y: from.y },
          { x: to.x, y: to.y },
        ],
      }
      : link;
  });
}

export function toggleSelection(selection: Selection[], item: Selection) {
  const exists = selection.some(
    (selected) => selected.kind === item.kind && selected.id === item.id,
  );
  return exists
    ? selection.filter(
      (selected) => !(selected.kind === item.kind && selected.id === item.id),
    )
    : [...selection, item];
}

export function normalizeBox(start: Point, current: Point) {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function labelize(key: string) {
  return key.replaceAll("_", " ");
}

export function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

