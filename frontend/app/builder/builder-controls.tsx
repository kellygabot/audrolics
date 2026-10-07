import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import NextImage from "next/image";
import { createPortal } from "react-dom";
import {
  clamp, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP,
  type HistoryState, type SchematicModel,
} from "./builder-model";

export function ToolbarButton({
  label,
  disabled = false,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="builder-toolbar-button h-8 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:border-cyan-700 hover:text-cyan-800 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
    >
      {label}
    </button>
  );
}

export function PanelHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="builder-panel-heading border-b border-slate-200 px-4 py-3">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}
export function BuilderToolbar({
  model, setModel, history, statusMessage, isDirty, commit, undo, redo,
  nudgeZoom, updateZoom, fitDiagramToView, guardedNavigate,
  guardedStartNewSchematic, setSaveModalOpen, setStatusMessage,
  deleteSchematic,
}: {
  model: SchematicModel;
  setModel: Dispatch<SetStateAction<SchematicModel>>;
  history: HistoryState;
  statusMessage: string;
  isDirty: boolean;
  commit: (update: (draft: SchematicModel) => SchematicModel, message?: string) => void;
  undo: () => void;
  redo: () => void;
  nudgeZoom: (delta: number) => void;
  updateZoom: (zoom: number) => void;
  fitDiagramToView: () => void;
  guardedNavigate: (href: string) => void;
  guardedStartNewSchematic: () => void;
  setSaveModalOpen: Dispatch<SetStateAction<boolean>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  deleteSchematic: () => void;
}) {
  const [strainerSettingsPosition, setStrainerSettingsPosition] = useState<{ left: number; top: number } | null>(null);
  const strainerSettingsButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!strainerSettingsPosition) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setStrainerSettingsPosition(null);
        strainerSettingsButtonRef.current?.focus();
      }
    };
    const closeOnResize = () => setStrainerSettingsPosition(null);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [strainerSettingsPosition]);
  return (
      <header className="builder-header flex h-14 shrink-0 items-center justify-between border-b border-slate-300 bg-white px-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">

          <NextImage onClick={() => guardedNavigate("/schematics")} src="/logo.svg" alt="Logo" width={32} height={32} className="h-8 w-8 ml-4" />
          <div className="builder-file-name min-w-0">
            <div className="flex items-center">
              <input
                value={model.name}
                onChange={(event) =>
                  commit((draft) => ({ ...draft, name: event.target.value }))
                }
                className="w-52 rounded border border-transparent px-1 text-sm font-semibold focus:border-cyan-700 focus:outline-none"
                aria-label="Schematic name"
              />
            </div>
          </div>
          <span className="sr-only" role="status">{statusMessage}</span>
        </div>

        <div className="flex items-center gap-2">
          <ToolbarButton
            label="Undo"
            disabled={history.past.length === 0}
            onClick={undo}
          />
          <ToolbarButton
            label="Redo"
            disabled={history.future.length === 0}
            onClick={redo}
          />
          <div className="mx-1 h-7 w-px bg-slate-300" />
          <ToolbarButton label="-" onClick={() => nudgeZoom(-ZOOM_STEP)} />
          <input
            className="h-8 w-28 accent-cyan-700"
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={ZOOM_STEP}
            value={model.canvas_state.zoom}
            onChange={(event) => updateZoom(Number(event.target.value))}
            aria-label="Canvas zoom"
          />
          <ToolbarButton label="+" onClick={() => nudgeZoom(ZOOM_STEP)} />
          <output className="w-14 text-right text-xs tabular-nums text-slate-600">
            {model.canvas_state.zoom}%
          </output>
          <ToolbarButton label="Fit" onClick={fitDiagramToView} />
          <div className="mx-1 h-7 w-px bg-slate-300" />
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600">
            Line
            <input
              aria-label="Line color"
              type="color"
              value={model.styling.line_color}
              onChange={(event) =>
                setModel((current) => ({
                  ...current,
                  styling: {
                    ...current.styling,
                    line_color: event.target.value,
                  },
                }))
              }
              className="h-6 w-7 rounded border border-slate-300 bg-white"
            />
          </label>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600">
            Width
            <input
              aria-label="Line thickness"
              type="number"
              min="1"
              max="8"
              value={model.styling.line_thickness}
              onChange={(event) =>
                setModel((current) => ({
                  ...current,
                  styling: {
                    ...current.styling,
                    line_thickness: clamp(Number(event.target.value), 1, 8),
                  },
                }))
              }
              className="h-8 w-14 rounded border border-slate-300 px-2 text-xs"
            />
          </label>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600">
            Symbols
            <input
              aria-label="Symbol size"
              type="number"
              min="0.5"
              max="2"
              step="0.1"
              value={model.styling.symbol_size}
              onChange={(event) =>
                setModel((current) => ({
                  ...current,
                  styling: {
                    ...current.styling,
                    symbol_size: clamp(Number(event.target.value), 0.5, 2),
                  },
                }))
              }
              className="h-8 w-14 rounded border border-slate-300 px-2 text-xs"
            />
          </label>
          <button
            ref={strainerSettingsButtonRef}
            type="button"
            aria-expanded={strainerSettingsPosition !== null}
            aria-controls="strainer-settings-panel"
            onClick={() => {
              if (strainerSettingsPosition) {
                setStrainerSettingsPosition(null);
                return;
              }
              const rect = strainerSettingsButtonRef.current!.getBoundingClientRect();
              setStrainerSettingsPosition({
                left: Math.max(8, Math.min(rect.right - 256, window.innerWidth - 264)),
                top: rect.bottom + 270 > window.innerHeight ? Math.max(8, rect.top - 270) : rect.bottom + 8,
              });
            }}
            className="flex h-8 cursor-pointer items-center rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:border-cyan-700 hover:text-cyan-800"
          >
            Strainer Settings
          </button>
        </div>

        {strainerSettingsPosition && createPortal(<>
          <button type="button" aria-label="Close strainer settings" className="fixed inset-0 z-40 cursor-default bg-transparent" onClick={() => setStrainerSettingsPosition(null)} />
          <div id="strainer-settings-panel" role="dialog" aria-label="Strainer Settings" className="fixed z-50 max-h-[calc(100dvh-16px)] w-64 max-w-[calc(100vw-16px)] overflow-y-auto rounded border border-slate-300 bg-white p-3 shadow-lg" style={strainerSettingsPosition}>
            <p className="mb-3 text-xs text-slate-600">
              Headloss multipliers saved with this schematic.
            </p>
            {(
              Object.entries(model.filter_multipliers) as [
                keyof SchematicModel["filter_multipliers"],
                number,
              ][]
            ).map(([key, value]) => (
              <label
                key={key}
                className="mb-2 flex items-center justify-between gap-3 text-xs font-medium capitalize text-slate-600"
              >
                <span>{key.replaceAll("_", " ")}</span>
                <input
                  aria-label={`${key.replaceAll("_", " ")} multiplier`}
                  type="number"
                  min="0"
                  step="0.1"
                  value={value}
                  onChange={(event) => {
                    const nextValue = Math.max(0, Number(event.target.value));
                    setModel((current) => ({
                      ...current,
                      filter_multipliers: {
                        ...current.filter_multipliers,
                        [key]: nextValue,
                      },
                    }));
                  }}
                  className="h-8 w-20 rounded border border-slate-300 px-2 text-xs"
                />
              </label>
            ))}
          </div>
        </>, document.body)}

        <div className="flex items-center gap-2">
          <ToolbarButton
            label="Library"
            onClick={() => guardedNavigate("/schematics")}
          />
          <div className="mx-1 h-7 w-px bg-slate-300" />
          <ToolbarButton label="New" onClick={guardedStartNewSchematic} />
          <ToolbarButton
            label="Save"
            onClick={() => {
              if (!isDirty) {
                setStatusMessage("No changes to save");
                return;
              }
              setSaveModalOpen(true);
            }}
          />
          <ToolbarButton
            label="Delete"
            disabled={!model.id}
            onClick={deleteSchematic}
          />
        </div>
      </header>
  );
}
