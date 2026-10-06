import type { NodeType, LinkType, ToolType } from "./builder-model";

// Palette metadata drives the left panel. Its symbol artwork is applied by
// builder.css, while these codes remain readable to assistive technology.
export const nodeTools: {
  type: NodeType;
  label: string;
  code: string;
  detail: string;
}[] = [
    { type: "JUNCTION", label: "Junction", code: "J", detail: "Small circle" },
    {
      type: "RESERVOIR",
      label: "Reservoir",
      code: "R",
      detail: "Hatched triangle",
    },
    { type: "TANK", label: "Tank", code: "T", detail: "Rectangle / cylinder" },
  ];

export const linkTools: {
  type: LinkType;
  label: string;
  code: string;
  detail: string;
}[] = [
    { type: "PIPE", label: "Pipe", code: "P", detail: "Connects two nodes" },
    { type: "PUMP", label: "Pump", code: "PU", detail: "Inline device — place between Junctions" },
    { type: "VALVE", label: "Valve", code: "V", detail: "Inline device — place between Junctions" },
    {
      type: "FILTER",
      label: "Strainer / Filter",
      code: "F",
      detail: "Inline device — place between Junctions",
    },
  ];

// A palette choice arms a tool for click placement; native drag and drop uses
// the same tool type so both entry paths create identical graph elements.
export function PaletteGroup({
  title,
  tools,
  activeTool,
  onPick,
}: {
  title: string;
  tools: { type: ToolType; label: string; code: string; detail: string }[];
  activeTool: ToolType | null;
  onPick: (tool: ToolType | null) => void;
}) {
  return (
    <section className="builder-palette-group mb-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-2">
        {tools.map((tool) => (
          <button
            key={tool.type}
            type="button"
            draggable
            onDragStart={(event) =>
              event.dataTransfer.setData(
                "application/audrolics-tool",
                tool.type,
              )
            }
            aria-pressed={activeTool === tool.type}
            onClick={() => onPick(activeTool === tool.type ? null : tool.type)}
            className={`builder-palette-tool flex items-center gap-3 rounded border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 ${activeTool === tool.type
              ? "border-cyan-700 bg-cyan-50 text-cyan-950"
              : "border-slate-200 bg-white text-slate-800 hover:border-cyan-700"
              }`}
          >
            <span className="builder-palette-symbol flex h-9 w-10 shrink-0 items-center justify-center rounded border border-slate-300 bg-slate-50 text-xs font-bold">
              {tool.code}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{tool.label}</span>
              <span className="builder-palette-detail block truncate text-xs text-slate-500">
                {tool.detail}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

