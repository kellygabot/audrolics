import type { LinkPayload, NodePayload, SchematicPayload } from "../types.js";
import { ApiError } from "../utils/errors.js";

export const isActiveLink = (link: LinkPayload): boolean => {
  if (link.type === "PIPE" || link.type === "VALVE" || link.type === "FILTER") {
    const status = link.input_params?.status;
    return status !== "CLOSED";
  }
  if (link.type === "PUMP") {
    return link.input_params?.status !== "OFF";
  }
  return true;
};

export const validateNetworkTopology = (payload: SchematicPayload): void => {
  const nodes = payload.nodes ?? [];
  const links = payload.links ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const activeLinks = links.filter(isActiveLink);

  // E102: dangling link (missing endpoint or invalid node reference)
  for (const link of links) {
    const from = link.from_node_id;
    const to = link.to_node_id;
    if (!from || !nodeById.has(from) || !to || !nodeById.has(to)) {
      throw new ApiError(
        400,
        "E102",
        `Pipe '${link.label}' has an unconnected endpoint. Connect both ends to nodes.`,
        link.id,
      );
    }
  }

  // Build adjacency over active links.
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) adjacency.set(node.id, new Set());
  for (const link of activeLinks) {
    const from = link.from_node_id!;
    const to = link.to_node_id!;
    adjacency.get(from)!.add(to);
    adjacency.get(to)!.add(from);
  }

  // E101: orphaned node (no connected active links)
  for (const node of nodes) {
    const degree = adjacency.get(node.id)?.size ?? 0;
    if (degree === 0) {
      throw new ApiError(
        400,
        "E101",
        `Node '${node.label}' has no connected links. Connect it or remove it.`,
        node.id,
      );
    }
  }

  // E100: no water source
  const sourceIds = nodes
    .filter((node) => node.type === "RESERVOIR" || node.type === "TANK")
    .map((node) => node.id);
  if (sourceIds.length === 0) {
    throw new ApiError(
      400,
      "E100",
      "Network has no Reservoir or Tank. Add at least one source node.",
    );
  }

  // E103: disconnected subgraph not reachable from any source
  const visited = new Set<string>();
  const queue = [...sourceIds];
  for (const id of sourceIds) visited.add(id);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  if (visited.size !== nodes.length) {
    throw new ApiError(
      400,
      "E103",
      "Network contains isolated elements not reachable from any source.",
    );
  }
};
