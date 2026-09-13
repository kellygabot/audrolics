import { runSimulation } from "../src/simulation/index.js";
import type { SchematicPayload } from "../src/types.js";

const payload: SchematicPayload = {
  name: "Single pipe",
  nodes: [
    { id: "r1", label: "R-1", type: "RESERVOIR", x: 0, y: 0, input_params: { total_head: 100 } },
    { id: "j1", label: "J-1", type: "JUNCTION", x: 100, y: 0, input_params: { elevation: 0, base_demand: 10 } },
  ],
  links: [
    { id: "p1", label: "P-1", type: "PIPE", from_node_id: "r1", to_node_id: "j1", input_params: { length: 1000, diameter: 300, roughness: 140 } },
  ],
};

try {
  const result = runSimulation(payload);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error);
}
