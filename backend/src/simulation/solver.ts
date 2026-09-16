import type { LinkPayload, NodePayload, SchematicPayload, SimulationResult } from "../types.js";
import { ApiError } from "../utils/errors.js";
import { isActiveLink, validateNetworkTopology } from "./topology.js";

const G_MPS2 = 9.81;
const HW_EXPONENT = 1.852;
const HW_CONSTANT = 10.67;
const HEAD_TOLERANCE_M = 0.001;
const FLOW_TOLERANCE_LPS = 0.001;
const MAX_ITERATIONS = 200;
const MIN_FLOW_M3S = 1e-7;

export type SolverNode = {
  id: string;
  label: string;
  type: "JUNCTION" | "RESERVOIR" | "TANK";
  elevation: number;
  baseDemandLps: number;
  fixedHeadM?: number;
  diameterM?: number;
};

export type SolverLink = {
  id: string;
  label: string;
  type: "PIPE" | "PUMP" | "VALVE" | "FILTER";
  fromNodeId: string;
  toNodeId: string;
  lengthM?: number;
  diameterMm?: number;
  cFactor?: number;
  minorLossCoeff?: number;
  status: string;
  pumpCurve?: { flow: number; head: number }[];
  ratedPowerKw?: number;
  valveType?: string;
  valveSetting?: number;
  gpvCurve?: { flow: number; headloss: number }[];
  filterStatus?: string;
  filterMultipliers?: { clean: number; partially_clogged: number; clogged: number };
};

export const computeHeadloss = (
  lengthM: number,
  diameterMm: number,
  cFactor: number,
  flowLps: number,
): number => {
  const qM3s = Math.abs(flowLps) / 1000;
  const dM = diameterMm / 1000;
  if (qM3s < MIN_FLOW_M3S) return 0;
  const num = HW_CONSTANT * lengthM * Math.pow(qM3s, HW_EXPONENT);
  const den = Math.pow(cFactor, HW_EXPONENT) * Math.pow(dM, 4.87);
  const hf = num / den;
  return flowLps >= 0 ? hf : -hf;
};

const areaFromDiameterMm = (diameterMm: number): number => {
  const dM = diameterMm / 1000;
  return Math.PI * Math.pow(dM / 2, 2);
};

const minorLoss = (
  flowM3s: number,
  diameterMm: number,
  kMinor: number,
): { h: number; g: number } => {
  const area = areaFromDiameterMm(diameterMm);
  if (Math.abs(flowM3s) < MIN_FLOW_M3S) return { h: 0, g: (kMinor * MIN_FLOW_M3S) / (G_MPS2 * area * area) };
  const v = flowM3s / area;
  const h = kMinor * (Math.abs(v) * v) / (2 * G_MPS2);
  const g = (kMinor * Math.abs(flowM3s)) / (G_MPS2 * area * area);
  return { h: flowM3s >= 0 ? h : -h, g };
};

const hazenWilliamsLoss = (
  lengthM: number,
  diameterMm: number,
  cFactor: number,
  flowM3s: number,
): { h: number; g: number } => {
  const absQ = Math.max(Math.abs(flowM3s), MIN_FLOW_M3S);
  const dM = diameterMm / 1000;
  const hAbs = (HW_CONSTANT * lengthM * Math.pow(absQ, HW_EXPONENT)) /
    (Math.pow(cFactor, HW_EXPONENT) * Math.pow(dM, 4.87));
  const g = (HW_EXPONENT * hAbs) / absQ;
  return {
    h: flowM3s >= 0 ? hAbs : -hAbs,
    g,
  };
};

const interpolatePumpCurve = (
  curve: { flow: number; head: number }[],
  flowLps: number,
): { head: number; derivativeMps: number; withinRange: boolean } => {
  const sorted = [...curve].sort((a, b) => a.flow - b.flow);
  const q = flowLps;
  if (q <= sorted[0].flow) {
    const nextSlope = sorted.length > 1
      ? (sorted[1].head - sorted[0].head) / ((sorted[1].flow - sorted[0].flow) / 1000)
      : 0;
    return { head: sorted[0].head, derivativeMps: nextSlope, withinRange: q >= sorted[0].flow };
  }
  if (q >= sorted[sorted.length - 1].flow) {
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const prevSlope = prev ? (last.head - prev.head) / ((last.flow - prev.flow) / 1000) : 0;
    return { head: last.head, derivativeMps: prevSlope, withinRange: q <= last.flow };
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (q >= a.flow && q <= b.flow) {
      const t = (q - a.flow) / (b.flow - a.flow);
      const head = a.head + t * (b.head - a.head);
      const slope = (b.head - a.head) / ((b.flow - a.flow) / 1000);
      return { head, derivativeMps: slope, withinRange: true };
    }
  }
  return { head: sorted[sorted.length - 1].head, derivativeMps: 0, withinRange: false };
};

const powerPumpHead = (
  ratedPowerKw: number,
  flowM3s: number,
): { head: number; derivativeMps: number } => {
  const q = Math.max(Math.abs(flowM3s), MIN_FLOW_M3S);
  const head = (ratedPowerKw * 1000) / (G_MPS2 * q);
  const derivative = -(ratedPowerKw * 1000) / (G_MPS2 * q * q);
  return { head, derivativeMps: derivative };
};

const interpolateGpvCurve = (
  curve: { flow: number; headloss: number }[],
  flowLps: number,
): { h: number; g: number } => {
  const sorted = [...curve].sort((a, b) => a.flow - b.flow);
  const q = Math.max(Math.abs(flowLps), MIN_FLOW_M3S);
  if (q <= sorted[0].flow) {
    const h = sorted[0].headloss * (q / Math.max(sorted[0].flow, MIN_FLOW_M3S));
    const g = sorted[0].headloss / Math.max(sorted[0].flow / 1000, MIN_FLOW_M3S);
    return { h: flowLps >= 0 ? h : -h, g };
  }
  if (q >= sorted[sorted.length - 1].flow) {
    const last = sorted[sorted.length - 1];
    const h = last.headloss;
    const prev = sorted[sorted.length - 2];
    const g = prev ? (last.headloss - prev.headloss) / ((last.flow - prev.flow) / 1000) : 0;
    return { h: flowLps >= 0 ? h : -h, g };
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (q >= a.flow && q <= b.flow) {
      const t = (q - a.flow) / (b.flow - a.flow);
      const h = a.headloss + t * (b.headloss - a.headloss);
      const g = (b.headloss - a.headloss) / ((b.flow - a.flow) / 1000);
      return { h: flowLps >= 0 ? h : -h, g };
    }
  }
  return { h: 0, g: 0 };
};

const linkHeadlossAndDerivative = (
  link: SolverLink,
  flowM3s: number,
): { h: number; g: number } => {
  const sign = flowM3s >= 0 ? 1 : -1;
  const absQ = Math.abs(flowM3s);

  if (link.type === "PIPE") {
    const hw = hazenWilliamsLoss(link.lengthM!, link.diameterMm!, link.cFactor!, flowM3s);
    const minor = minorLoss(flowM3s, link.diameterMm!, link.minorLossCoeff ?? 0);
    return { h: hw.h + minor.h, g: hw.g + minor.g };
  }

  if (link.type === "PUMP") {
    const qLps = flowM3s * 1000;
    let head: number;
    let derivative: number;
    if (link.pumpCurve && link.pumpCurve.length >= 2) {
      const interp = interpolatePumpCurve(link.pumpCurve, qLps);
      head = interp.head;
      derivative = interp.derivativeMps;
    } else if (link.ratedPowerKw) {
      const pp = powerPumpHead(link.ratedPowerKw, flowM3s);
      head = pp.head;
      derivative = pp.derivativeMps;
    } else {
      head = 0;
      derivative = 0;
    }
    return { h: -head * sign, g: -derivative };
  }

  if (link.type === "VALVE") {
    if (link.status === "CLOSED") return { h: 0, g: 1e12 };
    const diameter = link.diameterMm ?? 100;
    if (link.valveType === "GPV" && link.gpvCurve && link.gpvCurve.length >= 2) {
      return interpolateGpvCurve(link.gpvCurve, flowM3s * 1000);
    }
    const kSetting = link.valveSetting ?? 0.1;
    return minorLoss(flowM3s, diameter, kSetting);
  }

  // FILTER
  if (link.status === "CLOSED") return { h: 0, g: 1e12 };
  const diameter = link.diameterMm ?? 100;
  const status = link.filterStatus ?? "CLEAN";
  const multiplier = link.filterMultipliers?.[status as keyof typeof link.filterMultipliers] ??
    (status === "CLEAN" ? 1 : status === "PARTIALLY_CLOGGED" ? 3 : 10);
  const k = (link.minorLossCoeff ?? 0) * (multiplier as number);
  return minorLoss(flowM3s, diameter, k);
};

const buildUndirectedAdjacency = (
  links: SolverLink[],
  nodeCount: number,
  nodeById: Map<string, number>,
): Map<number, number[]> => {
  const adj = new Map<number, number[]>();
  for (let i = 0; i < nodeCount; i++) adj.set(i, []);
  for (const link of links) {
    const from = nodeById.get(link.fromNodeId);
    const to = nodeById.get(link.toNodeId);
    if (from === undefined || to === undefined) continue;
    adj.get(from)!.push(to);
    adj.get(to)!.push(from);
  }
  return adj;
};

const hasCycle = (nodeCount: number, adj: Map<number, number[]>): boolean => {
  const visited = new Array(nodeCount).fill(false);
  const dfs = (node: number, parent: number): boolean => {
    visited[node] = true;
    for (const neighbor of adj.get(node) ?? []) {
      if (!visited[neighbor]) {
        if (dfs(neighbor, node)) return true;
      } else if (neighbor !== parent) {
        return true;
      }
    }
    return false;
  };
  for (let i = 0; i < nodeCount; i++) {
    if (!visited[i] && (adj.get(i)?.length ?? 0) > 0) {
      if (dfs(i, -1)) return true;
    }
  }
  return false;
};

const solveTreeNetwork = (
  solverNodes: SolverNode[],
  solverLinks: SolverLink[],
  activeLinks: SolverLink[],
  nodeById: Map<string, number>,
  linkFlow: Map<string, number>,
  nodeHead: number[],
): { iterations: number; maxHeadError: number; maxFlowError: number } => {
  const sourceIndices = solverNodes
    .map((n, idx) => ({ n, idx }))
    .filter(({ n }) => n.fixedHeadM !== undefined)
    .map(({ idx }) => idx);

  if (sourceIndices.length !== 1) {
    throw new Error("Tree solver currently supports a single source");
  }

  const sourceIdx = sourceIndices[0];

  interface TreeEdge {
    neighbor: number;
    linkId: string;
    forward: boolean;
  }

  const adj = new Map<number, TreeEdge[]>();
  for (let i = 0; i < solverNodes.length; i++) adj.set(i, []);
  for (const link of activeLinks) {
    const from = nodeById.get(link.fromNodeId)!;
    const to = nodeById.get(link.toNodeId)!;
    adj.get(from)!.push({ neighbor: to, linkId: link.id, forward: true });
    adj.get(to)!.push({ neighbor: from, linkId: link.id, forward: false });
  }

  const parent = new Array<number>(solverNodes.length).fill(-1);
  const parentLink = new Array<string>(solverNodes.length).fill("");
  const parentForward = new Array<boolean>(solverNodes.length).fill(false);
  const children = new Map<number, number[]>();
  for (let i = 0; i < solverNodes.length; i++) children.set(i, []);
  const order: number[] = [];
  const queue = [sourceIdx];
  const visited = new Set<number>([sourceIdx]);

  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const { neighbor, linkId, forward } of adj.get(node)!) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      parent[neighbor] = node;
      parentLink[neighbor] = linkId;
      parentForward[neighbor] = forward;
      children.get(node)!.push(neighbor);
      queue.push(neighbor);
    }
  }

  if (visited.size !== solverNodes.length) {
    throw new Error("Tree solver: not all nodes reachable from source");
  }

  const subtreeDemand = new Array<number>(solverNodes.length).fill(0);
  for (const node of [...order].reverse()) {
    let demand = solverNodes[node].baseDemandLps / 1000;
    for (const child of children.get(node)!) {
      demand += subtreeDemand[child];
    }
    subtreeDemand[node] = demand;
  }

  for (const node of order) {
    if (node === sourceIdx) continue;
    const linkId = parentLink[node];
    const link = solverLinks.find((l) => l.id === linkId)!;
    const qMag = subtreeDemand[node];
    const qLink = parentForward[node] ? qMag : -qMag;
    linkFlow.set(linkId, qLink);
  }

  for (const node of order) {
    if (node === sourceIdx) continue;
    const linkId = parentLink[node];
    const link = solverLinks.find((l) => l.id === linkId)!;
    const qMag = subtreeDemand[node];
    const { h } = linkHeadlossAndDerivative(link, qMag);
    nodeHead[node] = nodeHead[parent[node]] - h;
  }

  // Tree solutions satisfy head-loss and continuity exactly by construction.
  return { iterations: 1, maxHeadError: 0, maxFlowError: 0 };
};

const estimateInitialFlows = (
  solverNodes: SolverNode[],
  activeLinks: SolverLink[],
  nodeById: Map<string, number>,
): Map<string, number> => {
  const flows = new Map<string, number>();

  // For acyclic networks this would be exact, but the function is only used
  // as a GGA seed for looped networks. Assign each link the average system
  // demand as a positive magnitude; direction follows the link definition.
  const totalDemandLps = solverNodes.reduce(
    (sum, n) => sum + (n.type === "JUNCTION" ? n.baseDemandLps : 0),
    0,
  );
  const avgFlowM3s = activeLinks.length > 0 ? totalDemandLps / activeLinks.length / 1000 : 0.001;
  const seed = Math.max(avgFlowM3s, MIN_FLOW_M3S);

  for (const link of activeLinks) {
    const fromIdx = nodeById.get(link.fromNodeId);
    const toIdx = nodeById.get(link.toNodeId);
    if (fromIdx === undefined || toIdx === undefined) continue;
    const fromDemand = solverNodes[fromIdx].baseDemandLps;
    const toDemand = solverNodes[toIdx].baseDemandLps;
    // Prefer positive flow toward demand.
    flows.set(link.id, toDemand > fromDemand ? seed : -seed);
  }

  return flows;
};

const parseNodes = (nodes: NodePayload[]): SolverNode[] => {
  return nodes.map((node) => {
    const params = node.input_params ?? {};
    if (node.type === "RESERVOIR") {
      return {
        id: node.id,
        label: node.label,
        type: node.type,
        elevation: Number(params.total_head ?? 0),
        baseDemandLps: 0,
        fixedHeadM: Number(params.total_head ?? 0),
      };
    }
    if (node.type === "TANK") {
      const elevation = Number(params.elevation ?? 0);
      const initialLevel = Number(params.initial_level ?? 0);
      return {
        id: node.id,
        label: node.label,
        type: node.type,
        elevation,
        baseDemandLps: 0,
        fixedHeadM: elevation + initialLevel,
        diameterM: Number(params.diameter ?? 0),
      };
    }
    return {
      id: node.id,
      label: node.label,
      type: node.type,
      elevation: Number(params.elevation ?? 0),
      baseDemandLps: Number(params.base_demand ?? 0),
    };
  });
};

const parseLinks = (
  links: LinkPayload[],
  filterMultipliers: { clean: number; partially_clogged: number; clogged: number },
): SolverLink[] => {
  return links.map((link) => {
    const params = link.input_params ?? {};
    const base: SolverLink = {
      id: link.id,
      label: link.label,
      type: link.type,
      fromNodeId: link.from_node_id!,
      toNodeId: link.to_node_id!,
      status: String(params.status ?? "OPEN"),
      filterMultipliers,
    };
    if (link.type === "PIPE") {
      return {
        ...base,
        lengthM: Number(params.length ?? 1),
        diameterMm: Number(params.diameter ?? 100),
        cFactor: Number(params.roughness ?? 140),
        minorLossCoeff: Number(params.minor_loss_coeff ?? 0),
      };
    }
    if (link.type === "PUMP") {
      return {
        ...base,
        pumpCurve: Array.isArray(params.pump_curve) ? params.pump_curve as { flow: number; head: number }[] : undefined,
        ratedPowerKw: params.rated_power === undefined ? undefined : Number(params.rated_power),
      };
    }
    if (link.type === "VALVE") {
      return {
        ...base,
        valveType: String(params.valve_type ?? "TCV"),
        diameterMm: Number(params.diameter ?? 100),
        valveSetting: params.valve_setting === undefined ? undefined : Number(params.valve_setting),
        gpvCurve: Array.isArray(params.gpv_curve) ? params.gpv_curve as { flow: number; headloss: number }[] : undefined,
      };
    }
    return {
      ...base,
      diameterMm: Number(params.diameter ?? 100),
      minorLossCoeff: Number(params.minor_loss_coeff ?? 0),
      filterStatus: String(params.filter_status ?? "CLEAN"),
    };
  });
};

const solveLinearSystem = (A: number[][], b: number[]): number[] => {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    let maxVal = Math.abs(M[i][i]);
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > maxVal) {
        maxVal = Math.abs(M[k][i]);
        maxRow = k;
      }
    }
    if (maxVal < 1e-12) {
      M[i][i] = 1;
      M[i][n] = 0;
      continue;
    }
    if (maxRow !== i) [M[i], M[maxRow]] = [M[maxRow], M[i]];

    for (let k = i + 1; k < n; k++) {
      const factor = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        M[k][j] -= factor * M[i][j];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(M[i][i]) < 1e-12) {
      x[i] = 0;
      continue;
    }
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
    x[i] = sum / M[i][i];
  }
  return x;
};

export const runSimulation = (payload: SchematicPayload): SimulationResult => {
  validateNetworkTopology(payload);

  const solverNodes = parseNodes(payload.nodes ?? []);
  const solverLinks = parseLinks(payload.links ?? [], payload.filter_multipliers ?? {
    clean: 1,
    partially_clogged: 3,
    clogged: 10,
  });

  const nodeById = new Map(solverNodes.map((n, idx) => [n.id, idx]));
  const activeLinks = solverLinks.filter((_, idx) => isActiveLink(payload.links![idx]));

  const nNodes = solverNodes.length;
  const nodeFixed = solverNodes.map((n) => n.fixedHeadM !== undefined);
  const fixedHeads = solverNodes.map((n) => n.fixedHeadM).filter((h): h is number => h !== undefined);
  const maxSourceHead = fixedHeads.length > 0 ? Math.max(...fixedHeads) : 0;
  const nodeHead = solverNodes.map((n) => n.fixedHeadM ?? maxSourceHead);
  const nodeDemand = solverNodes.map((n) => n.baseDemandLps / 1000);

  const linkFlow = new Map<string, number>();
  const linkFromIdx = new Map<string, number>();
  const linkToIdx = new Map<string, number>();

  for (const link of activeLinks) {
    const fromIdx = nodeById.get(link.fromNodeId);
    const toIdx = nodeById.get(link.toNodeId);
    if (fromIdx === undefined || toIdx === undefined) {
      throw new ApiError(400, "E102", `Link '${link.label}' references an unknown node.`, link.id);
    }
    linkFromIdx.set(link.id, fromIdx);
    linkToIdx.set(link.id, toIdx);
  }

  let maxHeadError = Infinity;
  let maxFlowError = Infinity;
  let iterations = 0;
  const warnings: string[] = [];

  // Acyclic single-source networks can be solved sequentially and exactly.
  const adj = buildUndirectedAdjacency(activeLinks, nNodes, nodeById);
  const singleSource = fixedHeads.length === 1;
  if (singleSource && !hasCycle(nNodes, adj)) {
    ({ iterations, maxHeadError, maxFlowError } = solveTreeNetwork(
      solverNodes,
      solverLinks,
      activeLinks,
      nodeById,
      linkFlow,
      nodeHead,
    ));
  } else {
    // Looped networks: seed GGA with demand-driven flows and source-level heads.
    const initialFlows = estimateInitialFlows(solverNodes, activeLinks, nodeById);
    for (const link of activeLinks) {
      linkFlow.set(link.id, initialFlows.get(link.id) ?? MIN_FLOW_M3S);
    }

    let divergenceCount = 0;
    let previousHeadCorrectionNorm = Infinity;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      iterations = iter + 1;

      // Count unknown nodes and build mapping.
      const unknownIndices: number[] = [];
      for (let i = 0; i < nNodes; i++) if (!nodeFixed[i]) unknownIndices.push(i);
      const unknownMap = new Map(unknownIndices.map((idx, i) => [idx, i]));
      const nUnknown = unknownIndices.length;

      const M: number[][] = Array.from({ length: nUnknown }, () => new Array(nUnknown).fill(0));
      const RHS = new Array(nUnknown).fill(0);

      maxHeadError = 0;
      maxFlowError = 0;

      for (const link of activeLinks) {
        const fromIdx = linkFromIdx.get(link.id)!;
        const toIdx = linkToIdx.get(link.id)!;
        const Q = linkFlow.get(link.id)!;

        // Apply FCV setting as a hard flow target.
        if (link.type === "VALVE" && link.valveType === "FCV" && link.status === "ACTIVE" && link.valveSetting !== undefined) {
          const target = link.valveSetting / 1000;
          const error = target - Q;
          linkFlow.set(link.id, target);
          maxFlowError = Math.max(maxFlowError, Math.abs(error) * 1000);
          continue;
        }

        const { h, g } = linkHeadlossAndDerivative(link, Q);
        const H_from = nodeHead[fromIdx];
        const H_to = nodeHead[toIdx];
        const F1 = h - (H_from - H_to);

        const uFrom = unknownMap.get(fromIdx);
        const uTo = unknownMap.get(toIdx);
        const invG = 1 / Math.max(g, 1e-12);

        if (uFrom !== undefined) {
          M[uFrom][uFrom] += invG;
          RHS[uFrom] += F1 * invG;
        }
        if (uTo !== undefined) {
          M[uTo][uTo] += invG;
          RHS[uTo] -= F1 * invG;
        }
        if (uFrom !== undefined && uTo !== undefined) {
          M[uFrom][uTo] -= invG;
          M[uTo][uFrom] -= invG;
        }
      }

      // Mass balance contributions.
      for (let ui = 0; ui < nUnknown; ui++) {
        const nodeIdx = unknownIndices[ui];
        let netInflow = 0;
        for (const link of activeLinks) {
          const fromIdx = linkFromIdx.get(link.id)!;
          const toIdx = linkToIdx.get(link.id)!;
          if (link.type === "VALVE" && link.valveType === "FCV" && link.status === "ACTIVE") continue;
          if (fromIdx === nodeIdx) netInflow -= linkFlow.get(link.id)!;
          if (toIdx === nodeIdx) netInflow += linkFlow.get(link.id)!;
        }
        RHS[ui] += netInflow - nodeDemand[nodeIdx];
      }

      const deltaH = solveLinearSystem(M, RHS);

      for (let ui = 0; ui < nUnknown; ui++) {
        const nodeIdx = unknownIndices[ui];
        nodeHead[nodeIdx] += deltaH[ui];
        maxHeadError = Math.max(maxHeadError, Math.abs(deltaH[ui]));
      }

      // Update flows.
      for (const link of activeLinks) {
        if (link.type === "VALVE" && link.valveType === "FCV" && link.status === "ACTIVE") continue;
        const fromIdx = linkFromIdx.get(link.id)!;
        const toIdx = linkToIdx.get(link.id)!;
        const Q = linkFlow.get(link.id)!;
        const { h, g } = linkHeadlossAndDerivative(link, Q);
        const F1 = h - (nodeHead[fromIdx] - nodeHead[toIdx]);
        const dH = (unknownMap.has(fromIdx) ? deltaH[unknownMap.get(fromIdx)!] : 0) -
          (unknownMap.has(toIdx) ? deltaH[unknownMap.get(toIdx)!] : 0);
        const deltaQ = (-F1 + dH) / Math.max(g, 1e-12);
        const newQ = Q + deltaQ;
        linkFlow.set(link.id, newQ);
        maxFlowError = Math.max(maxFlowError, Math.abs(deltaQ) * 1000);
      }

      // Divergence guard: abort only if head residuals blow up repeatedly.
      if (maxHeadError > previousHeadCorrectionNorm) {
        divergenceCount++;
        if (divergenceCount >= 20) {
          throw new ApiError(
            422,
            "E104",
            `Simulation did not converge after ${iterations} iterations. Check for unrealistic configurations (e.g., reservoirs at different heads connected directly).`,
          );
        }
      } else {
        divergenceCount = 0;
      }
      previousHeadCorrectionNorm = maxHeadError;

      if (maxHeadError <= HEAD_TOLERANCE_M && maxFlowError <= FLOW_TOLERANCE_LPS) break;
    }

    if (maxHeadError > HEAD_TOLERANCE_M || maxFlowError > FLOW_TOLERANCE_LPS) {
      throw new ApiError(
        422,
        "E104",
        `Simulation did not converge after ${iterations} iterations. Check for unrealistic configurations (e.g., reservoirs at different heads connected directly).`,
      );
    }
  }

  // Post-process PRV active valves: clamp downstream head to setting.
  for (const link of activeLinks) {
    if (link.type === "VALVE" && link.valveType === "PRV" && link.status === "ACTIVE" && link.valveSetting !== undefined) {
      const toIdx = linkToIdx.get(link.id)!;
      const setting = link.valveSetting;
      if (nodeHead[toIdx] > setting) nodeHead[toIdx] = setting;
    }
  }

  // Build results.
  const nodeResults = solverNodes.map((node, idx) => {
    const head = nodeHead[idx];
    if (node.type === "JUNCTION") {
      const pressureHead = head - node.elevation;
      if (pressureHead < 0) {
        warnings.push(`E105: Negative pressure (${pressureHead.toFixed(3)} m) detected at node '${node.label}'. Check elevations and demands.`);
      }
      return {
        id: node.id,
        pressure_head: pressureHead,
        actual_demand: node.baseDemandLps,
      };
    }
    if (node.type === "RESERVOIR") {
      let outflow = 0;
      for (const link of activeLinks) {
        const fromIdx = linkFromIdx.get(link.id)!;
        const toIdx = linkToIdx.get(link.id)!;
        const Q = linkFlow.get(link.id)!;
        const sign = fromIdx === idx ? 1 : -1;
        if (fromIdx === idx || toIdx === idx) outflow += sign * Q * 1000;
      }
      return { id: node.id, outflow };
    }
    // TANK
    const diameter = node.diameterM ?? 0;
    const initialLevel = head - node.elevation;
    const currentVolume = Math.PI * Math.pow(diameter / 2, 2) * initialLevel;
    return { id: node.id, hydraulic_head: head, current_volume: currentVolume };
  });

  const linkResults = solverLinks.map((link) => {
    if (!linkFlow.has(link.id)) {
      return {
        id: link.id,
        flow_rate: 0,
        velocity: 0,
        headloss: 0,
        unit_headloss: 0,
        head_added: 0,
        energy: 0,
        pressure_drop: 0,
      };
    }
    const Qm3s = linkFlow.get(link.id)!;
    const Qlps = Qm3s * 1000;
    const { h } = linkHeadlossAndDerivative(link, Qm3s);

    if (link.type === "PIPE") {
      const area = areaFromDiameterMm(link.diameterMm!);
      const velocity = Math.abs(Qm3s) < MIN_FLOW_M3S ? 0 : Qm3s / area;
      const unitHeadloss = link.lengthM! > 0 ? (Math.abs(h) * 1000) / link.lengthM! : 0;
      return {
        id: link.id,
        flow_rate: Qlps,
        velocity,
        headloss: h,
        unit_headloss: unitHeadloss,
      };
    }

    if (link.type === "PUMP") {
      const headAdded = -h;
      const powerKw = (G_MPS2 * 1000 * Math.abs(Qm3s) * headAdded) / 1000;
      if (link.pumpCurve && link.pumpCurve.length >= 2) {
        const interp = interpolatePumpCurve(link.pumpCurve, Math.abs(Qlps));
        if (!interp.withinRange) {
          warnings.push(`E106: Pump '${link.label}' operating point (${Math.abs(Qlps).toFixed(3)} L/s, ${headAdded.toFixed(3)} m) is outside its curve. Results may be unreliable.`);
        }
      }
      return { id: link.id, flow_rate: Qlps, head_added: headAdded, energy: powerKw };
    }

    if (link.type === "VALVE") {
      return { id: link.id, flow_rate: Qlps, pressure_drop: h };
    }

    // FILTER
    return { id: link.id, flow_rate: Qlps, headloss: h };
  });

  return {
    status: warnings.length > 0 ? "success" : "success",
    node_results: nodeResults,
    link_results: linkResults,
    iterations,
    max_head_error: maxHeadError,
    max_flow_error: maxFlowError,
    warnings,
  };
};
