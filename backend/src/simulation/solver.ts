export interface SolverNode {
  id: string;
  type: "JUNCTION" | "RESERVOIR" | "TANK";
  elevation: number;
  baseDemandLps: number;
  fixedHeadM?: number;
}

export interface SolverLink {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  lengthM: number;
  diameterMm: number;
  cFactor: number;
  status: "OPEN" | "CLOSED";
}

export function computeHeadloss(lengthM: number, diameterMm: number, cFactor: number, flowLps: number): number {
  const qM3s = Math.abs(flowLps) / 1000;
  const dM = diameterMm / 1000;
  const num = 10.67 * lengthM * Math.pow(qM3s, 1.852);
  const den = Math.pow(cFactor, 1.852) * Math.pow(dM, 4.87);
  const hf = num / den;
  return flowLps >= 0 ? hf : -hf;
}