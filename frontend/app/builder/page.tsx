
"use client";

// Imports
import {
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  fitToView,
  validateFieldValue,
  validateTankLevels,
} from "../../lib/builder-rules";

import {
  deleteSchematic as deleteStoredSchematic,
  listSchematics,
  loadSchematic as loadStoredSchematic,
  saveSchematic as saveStoredSchematic,
} from "../../lib/builder-storage";

// Elements, types and necessary variables
type NodeType = "JUNCTION" | "RESERVOIR" | "TANK";
type LinkType = "PIPE" | "PUMP" | "VALVE" | "FILTER";
type ToolType = NodeType | LinkType;
type Selection = { kind: "node"; id: string } | { kind: "link"; id: string };
type FieldValue = string | number | CurvePoint[] | undefined;
type InputParams = Record<string, FieldValue>;
type ComputedValues = Record<string, number | null>;

type BuilderNode = {
  id: string;
  label: string;
  type: NodeType;
  x: number;
  y: number;
  input_params: InputParams;
  computed: ComputedValues;
};

type BuilderLink = {
  id: string;
  label: string;
  type: LinkType;
  from_node_id: string | null;
  to_node_id: string | null;
  points: { x: number; y: number }[];
  input_params: InputParams;
  computed: ComputedValues;
};

type CurvePoint = {
  flow: string;
  head?: string;
  headloss?: string;
};

type SchematicModel = {
  id?: string;
  name: string;
  nodes: BuilderNode[];
  links: BuilderLink[];
  measurements: unknown[];
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
type HistoryState = {
  past: SchematicModel[];
  future: SchematicModel[];
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type DragState =
  | {
      kind: "node";
      id: string;
      pointerId: number;
      offsetX: number;
      offsetY: number;
      moved: boolean;
    }
  | { kind: "select"; pointerId: number; start: Point; current: Point };

type Point = { x: number; y: number };
type ContextMenuState = { x: number; y: number; selection: Selection } | null;

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;
const SNAP_PX = 10;
const HISTORY_LIMIT = 60;
const RECOVERY_KEY = "audrolics.builder.recovery";

const nodeTools: {
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

const linkTools: {
  type: LinkType;
  label: string;
  code: string;
  detail: string;
}[] = [
  { type: "PIPE", label: "Pipe", code: "P", detail: "Straight line" },
  { type: "PUMP", label: "Pump", code: "PU", detail: "Pump symbol" },
  { type: "VALVE", label: "Valve", code: "V", detail: "Typed valve" },
  {
    type: "FILTER",
    label: "Strainer / Filter",
    code: "F",
    detail: "Dashed diamond",
  },
];

const defaultModel = (): SchematicModel => ({
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
  styling: { line_color: "#0f766e", line_thickness: 2, symbol_size: 1 },
  visibility: {
    length: true,
    diameter: true,
    pressure: true,
    flow: true,
    elevation: true,
  },
});

const readRecoveryModel = (): SchematicModel | null => {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem(RECOVERY_KEY);
  if (!raw) return null;
  try {
    const recovered = JSON.parse(raw) as SchematicModel;
    return recovered?.nodes && recovered?.links ? recovered : null;
  } catch {
    window.localStorage.removeItem(RECOVERY_KEY);
    return null;
  }
};

const isNodeTool = (tool: ToolType | null): tool is NodeType =>
  tool === "JUNCTION" || tool === "RESERVOIR" || tool === "TANK";

const isLinkTool = (tool: ToolType | null): tool is LinkType =>
  tool === "PIPE" || tool === "PUMP" || tool === "VALVE" || tool === "FILTER";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export default function BuilderPage() {
  const [model, setModel] = useState(defaultModel);
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    future: [],
  });
  const [selection, setSelection] = useState<Selection[]>([]);
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [pendingLink, setPendingLink] = useState<{
    type: LinkType;
    fromNodeId: string;
    cursor: Point;
  } | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [panState, setPanState] = useState<PanState | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [devUserId, setDevUserId] = useState("dev-user");
  const [schematicList, setSchematicList] = useState<
    { id: string; name: string; updated_at: string }[]
  >([]);
  const [selectedSavedSchematicId, setSelectedSavedSchematicId] = useState("");
  const [statusMessage, setStatusMessage] = useState("Ready to build");
  const [rightPanelWidth, setRightPanelWidth] = useState(340);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [recoveryCandidate, setRecoveryCandidate] =
    useState<SchematicModel | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(() =>
    JSON.stringify(toApiPayload(defaultModel())),
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [pendingSavedDelete, setPendingSavedDelete] = useState<string | null>(
    null,
  );
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Node dragging updates live without pushing every pointer move into history.
  // The starting snapshot is committed once on pointer-up.
  const dragStartModelRef = useRef<SchematicModel | null>(null);

  const selectedNode =
    selection.length === 1 && selection[0].kind === "node"
      ? model.nodes.find((node) => node.id === selection[0].id)
      : undefined;
  const selectedLink =
    selection.length === 1 && selection[0].kind === "link"
      ? model.links.find((link) => link.id === selection[0].id)
      : undefined;
  const validation = useMemo(() => validateModel(model), [model]);
  const zoomFactor = model.canvas_state.zoom / 100;
  const transform = `translate(${model.canvas_state.pan.x} ${model.canvas_state.pan.y}) scale(${zoomFactor})`;
  const isPanning = panState !== null;
  const cursorClass =
    isPanning || isResizingPanel
      ? "cursor-grabbing"
      : isSpacePressed
        ? "cursor-grab"
        : "cursor-crosshair";

  useEffect(() => {
    // Keep the first client render identical to SSR, then offer recovery.
    const timeout = window.setTimeout(() => {
      const recovered = readRecoveryModel();
      if (recovered) setRecoveryCandidate(recovered);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    // Autosave-lite from the SRS: local recovery only, separate from explicit Mongo save.
    const interval = window.setInterval(() => {
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(model));
    }, 30000);
    return () => window.clearInterval(interval);
  }, [model]);

  useEffect(() => {
    // Warn only after a diagram edit has created undo history.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(toApiPayload(model)) === lastSavedSnapshot) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [lastSavedSnapshot, model]);

  useEffect(() => {
    if (!isResizingPanel) return;
    const onMove = (event: PointerEvent) => {
      setRightPanelWidth(clamp(window.innerWidth - event.clientX, 280, 480));
    };
    const onUp = () => setIsResizingPanel(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [isResizingPanel]);

  function commit(
    update: (draft: SchematicModel) => SchematicModel,
    message?: string,
  ) {
    // Use this for diagram edits that should be undoable.
    // Viewport and panel-only UI state intentionally bypass it.
    setModel((current) => {
      const next = update(structuredClone(current));
      setHistory((state) => ({
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), current],
        future: [],
      }));
      return next;
    });
    if (message) setStatusMessage(message);
  }

  function undo() {
    setHistory((state) => {
      const previous = state.past.at(-1);
      if (!previous) return state;
      setModel(previous);
      return {
        past: state.past.slice(0, -1),
        future: [model, ...state.future],
      };
    });
  }

  function redo() {
    setHistory((state) => {
      const next = state.future[0];
      if (!next) return state;
      setModel(next);
      return {
        past: [...state.past, model].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    });
  }

  function setViewport(partial: Partial<SchematicModel["canvas_state"]>) {
    // Pan/zoom is useful UI state but not an undoable diagram edit.
    setModel((current) => ({
      ...current,
      canvas_state: {
        ...current.canvas_state,
        ...partial,
        pan: partial.pan ?? current.canvas_state.pan,
      },
    }));
  }

  function updateZoom(nextZoom: number) {
    setViewport({ zoom: clamp(nextZoom, MIN_ZOOM, MAX_ZOOM) });
  }

  function nudgeZoom(delta: number) {
    updateZoom(model.canvas_state.zoom + delta);
  }

  function fitDiagramToView() {
    const rect = canvasRef.current?.getBoundingClientRect();
    const nextCanvasState = fitToView(model.nodes, {
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
    });
    setViewport(nextCanvasState);
    setStatusMessage(
      model.nodes.length === 0
        ? "Canvas reset to 100%"
        : "Diagram fitted to view",
    );
  }

  function restoreRecoveryDraft() {
    if (!recoveryCandidate) return;
    setModel(recoveryCandidate);
    setSelection([]);
    setHistory({ past: [], future: [] });
    setShowAllErrors(false);
    setLastSavedSnapshot(JSON.stringify(toApiPayload(recoveryCandidate)));
    setRecoveryCandidate(null);
    setStatusMessage("Local draft restored");
  }

  function discardRecoveryDraft() {
    window.localStorage.removeItem(RECOVERY_KEY);
    setRecoveryCandidate(null);
    setStatusMessage("Local draft discarded");
  }

  function screenToWorld(clientX: number, clientY: number): Point {
    // All SVG elements are stored in world coordinates. Pointer events arrive
    // in screen pixels, so every placement/snap/drag goes through this adapter.
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - model.canvas_state.pan.x) / zoomFactor,
      y: (clientY - rect.top - model.canvas_state.pan.y) / zoomFactor,
    };
  }

  function nearestNode(point: Point, exceptId?: string) {
    // The SRS defines snapping in screen pixels. Convert that threshold into
    // world units so snapping feels consistent at every zoom level.
    const threshold = SNAP_PX / zoomFactor;
    return model.nodes.find((node) => {
      if (node.id === exceptId) return false;
      return distance(point, node) <= threshold;
    });
  }

  function createNode(type: NodeType, point: Point) {
    // New elements intentionally start with blank engineering fields. Validation
    // appears after touch/save so placement itself stays lightweight.
    const node: BuilderNode = {
      id: id("node"),
      label: nextLabel(type, model),
      type,
      x: point.x,
      y: point.y,
      input_params: defaultNodeParams(type),
      computed: defaultNodeComputed(type),
    };
    commit(
      (draft) => ({ ...draft, nodes: [...draft.nodes, node] }),
      `${node.label} placed`,
    );
    setSelection([{ kind: "node", id: node.id }]);
    setActiveTool(null);
  }

  function createLink(type: LinkType, fromNodeId: string, toNodeId: string) {
    // Links are graph edges first and rendered lines second. The saved endpoint
    // ids are the source of truth; points are cached for export/interoperability.
    if (fromNodeId === toNodeId) {
      setStatusMessage("Choose a different target node");
      return;
    }
    const from = model.nodes.find((node) => node.id === fromNodeId);
    const to = model.nodes.find((node) => node.id === toNodeId);
    if (!from || !to) return;
    const link: BuilderLink = {
      id: id("link"),
      label: nextLabel(type, model),
      type,
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
      points: [
        { x: from.x, y: from.y },
        { x: to.x, y: to.y },
      ],
      input_params: defaultLinkParams(type),
      computed: defaultLinkComputed(type),
    };
    commit(
      (draft) => ({ ...draft, links: [...draft.links, link] }),
      `${link.label} connected`,
    );
    setSelection([{ kind: "link", id: link.id }]);
    setPendingLink(null);
    setActiveTool(null);
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Canvas pointer ownership is split by mode: pan, node placement, or drag-box
    // selection. Element-specific handlers stop propagation before this runs.
    setContextMenu(null);
    if (
      event.target !== event.currentTarget &&
      (event.target as Element).closest("[data-element-id]")
    )
      return;
    const world = screenToWorld(event.clientX, event.clientY);
    if (event.button === 1 || (event.button === 0 && isSpacePressed)) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setPanState({
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: model.canvas_state.pan.x,
        originY: model.canvas_state.pan.y,
      });
      return;
    }
    if (isNodeTool(activeTool)) {
      createNode(activeTool, world);
      return;
    }
    if (event.button === 0) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelection([]);
      setDragState({
        kind: "select",
        pointerId: event.pointerId,
        start: world,
        current: world,
      });
    }
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const world = screenToWorld(event.clientX, event.clientY);
    if (panState?.pointerId === event.pointerId) {
      setViewport({
        pan: {
          x: panState.originX + event.clientX - panState.startX,
          y: panState.originY + event.clientY - panState.startY,
        },
      });
      return;
    }
    if (pendingLink) setPendingLink({ ...pendingLink, cursor: world });
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    if (dragState.kind === "select") {
      setDragState({ ...dragState, current: world });
      return;
    }
    setModel((current) => {
      const movedNodes = current.nodes.map((node) =>
        node.id === dragState.id
          ? {
              ...node,
              x: world.x - dragState.offsetX,
              y: world.y - dragState.offsetY,
            }
          : node,
      );
      return {
        ...current,
        nodes: movedNodes,
        links: updateLinkPointsForNodes(current.links, movedNodes),
      };
    });
    setDragState({ ...dragState, moved: true });
  }

  function handleCanvasPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const world = screenToWorld(event.clientX, event.clientY);
    if (panState?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setPanState(null);
    }
    if (dragState?.pointerId === event.pointerId) {
      if (
        dragState.kind === "node" &&
        dragState.moved &&
        dragStartModelRef.current
      ) {
        const dragStart = dragStartModelRef.current;
        setHistory((state) => ({
          past: [...state.past.slice(-(HISTORY_LIMIT - 1)), dragStart],
          future: [],
        }));
      }
      if (dragState.kind === "select") {
        const box = normalizeBox(dragState.start, dragState.current);
        const selectedNodes = model.nodes
          .filter(
            (node) =>
              node.x >= box.x &&
              node.x <= box.x + box.width &&
              node.y >= box.y &&
              node.y <= box.y + box.height,
          )
          .map((node) => ({ kind: "node" as const, id: node.id }));
        setSelection(selectedNodes);
      }
      event.currentTarget.releasePointerCapture(event.pointerId);
      setDragState(null);
      dragStartModelRef.current = null;
    }
    if (pendingLink) {
      const target = nearestNode(world, pendingLink.fromNodeId);
      if (target)
        createLink(pendingLink.type, pendingLink.fromNodeId, target.id);
    }
  }

  function handleNodePointerDown(
    event: ReactPointerEvent<SVGGElement>,
    node: BuilderNode,
  ) {
    event.stopPropagation();
    setContextMenu(null);
    const world = screenToWorld(event.clientX, event.clientY);
    if (isLinkTool(activeTool)) {
      setPendingLink({ type: activeTool, fromNodeId: node.id, cursor: world });
      return;
    }
    if (event.shiftKey) {
      setSelection((current) =>
        toggleSelection(current, { kind: "node", id: node.id }),
      );
    } else {
      setSelection([{ kind: "node", id: node.id }]);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      kind: "node",
      id: node.id,
      pointerId: event.pointerId,
      offsetX: world.x - node.x,
      offsetY: world.y - node.y,
      moved: false,
    });
    dragStartModelRef.current = structuredClone(model);
  }

  function handleNodeClick(
    event: ReactPointerEvent<SVGGElement>,
    node: BuilderNode,
  ) {
    if (!pendingLink || event.button !== 0) return;
    event.stopPropagation();
    createLink(pendingLink.type, pendingLink.fromNodeId, node.id);
  }

  function handleLinkPointerDown(
    event: ReactPointerEvent<SVGGElement>,
    link: BuilderLink,
  ) {
    event.stopPropagation();
    setContextMenu(null);
    setSelection(
      event.shiftKey
        ? toggleSelection(selection, { kind: "link", id: link.id })
        : [{ kind: "link", id: link.id }],
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.code === "Space") {
      event.preventDefault();
      setIsSpacePressed(true);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      copySelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
      pasteSelection();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelection();
      return;
    }
    if (event.key === "+" || event.key === "=") nudgeZoom(ZOOM_STEP);
    if (event.key === "-") nudgeZoom(-ZOOM_STEP);
  }

  function handleKeyUp(event: KeyboardEvent<HTMLDivElement>) {
    if (event.code === "Space") {
      event.preventDefault();
      setIsSpacePressed(false);
    }
  }

  function copySelection() {
    if (selection.length === 0) return;
    const selectedNodeIds = new Set(
      selection.filter((item) => item.kind === "node").map((item) => item.id),
    );
    const selectedLinkIds = new Set(
      selection.filter((item) => item.kind === "link").map((item) => item.id),
    );
    const nodes = model.nodes.filter((node) => selectedNodeIds.has(node.id));
    // Include internal links when both endpoint nodes are copied, so pasted
    // subnetworks preserve their connectivity.
    const links = model.links.filter(
      (link) =>
        selectedLinkIds.has(link.id) ||
        (link.from_node_id &&
          link.to_node_id &&
          selectedNodeIds.has(link.from_node_id) &&
          selectedNodeIds.has(link.to_node_id)),
    );
    navigator.clipboard
      ?.writeText(JSON.stringify({ nodes, links }))
      .catch(() => undefined);
    sessionStorage.setItem(
      "audrolics.builder.clipboard",
      JSON.stringify({ nodes, links }),
    );
    setStatusMessage("Selection copied");
  }

  function pasteSelection() {
    const raw = sessionStorage.getItem("audrolics.builder.clipboard");
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      nodes: BuilderNode[];
      links: BuilderLink[];
    };
    const nodeIdMap = new Map<string, string>();
    const pastedNodes = parsed.nodes.map((node) => {
      const newId = id("node");
      nodeIdMap.set(node.id, newId);
      return {
        ...structuredClone(node),
        id: newId,
        label: nextLabel(node.type, model),
        x: node.x + 32,
        y: node.y + 32,
      };
    });
    const pastedLinks = parsed.links
      .filter(
        (link) =>
          link.from_node_id &&
          link.to_node_id &&
          nodeIdMap.has(link.from_node_id) &&
          nodeIdMap.has(link.to_node_id),
      )
      .map((link) => ({
        ...structuredClone(link),
        id: id("link"),
        label: nextLabel(link.type, { ...model, links: [...model.links] }),
        from_node_id: nodeIdMap.get(link.from_node_id!)!,
        to_node_id: nodeIdMap.get(link.to_node_id!)!,
      }));
    commit(
      (draft) => ({
        ...draft,
        nodes: [...draft.nodes, ...pastedNodes],
        links: [...draft.links, ...pastedLinks],
      }),
      "Selection pasted",
    );
    setSelection(pastedNodes.map((node) => ({ kind: "node", id: node.id })));
  }

  function deleteSelection() {
    if (selection.length === 0) return;
    deleteItems(selection);
  }

  function deleteItems(items: Selection[]) {
    if (items.length === 0) return;
    const nodeIds = new Set(
      items.filter((item) => item.kind === "node").map((item) => item.id),
    );
    const linkIds = new Set(
      items.filter((item) => item.kind === "link").map((item) => item.id),
    );
    commit(
      (draft) => ({
        ...draft,
        nodes: draft.nodes.filter((node) => !nodeIds.has(node.id)),
        links: draft.links.filter(
          (link) =>
            !linkIds.has(link.id) &&
            !nodeIds.has(link.from_node_id ?? "") &&
            !nodeIds.has(link.to_node_id ?? ""),
        ),
      }),
      "Selection deleted",
    );
    setSelection([]);
  }

  function openElementContextMenu(
    event: ReactMouseEvent<SVGGElement>,
    item: Selection,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelection([item]);
    setContextMenu({ x: event.clientX, y: event.clientY, selection: item });
  }

  function deleteContextSelection() {
    if (!contextMenu) return;
    deleteItems([contextMenu.selection]);
    setContextMenu(null);
  }

  function updateNodeParam(nodeId: string, key: string, value: FieldValue) {
    commit((draft) => ({
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, input_params: { ...node.input_params, [key]: value } }
          : node,
      ),
    }));
  }

  function updateLinkParam(linkId: string, key: string, value: FieldValue) {
    commit((draft) => ({
      ...draft,
      links: draft.links.map((link) =>
        link.id === linkId
          ? { ...link, input_params: { ...link.input_params, [key]: value } }
          : link,
      ),
    }));
  }

  function renameSelected(value: string) {
    if (selectedNode) {
      commit((draft) => ({
        ...draft,
        nodes: draft.nodes.map((node) =>
          node.id === selectedNode.id ? { ...node, label: value } : node,
        ),
      }));
    }
    if (selectedLink) {
      commit((draft) => ({
        ...draft,
        links: draft.links.map((link) =>
          link.id === selectedLink.id ? { ...link, label: value } : link,
        ),
      }));
    }
  }

  async function saveSchematic() {
    setShowAllErrors(true);
    const errors = validateModel(model);
    if (Object.keys(errors).length > 0) {
      setStatusMessage(
        "Fix the highlighted fields before saving this schematic",
      );
      return;
    }
    const saved = await saveStoredSchematic(devUserId, toApiPayload(model));
    setModel(fromApiPayload(saved));
    setHistory({ past: [], future: [] });
    setLastSavedSnapshot(JSON.stringify(saved));
    setStatusMessage(`Saved "${saved.name}" to this browser`);
    void loadSchematicList();
  }

  async function loadSchematicList() {
    const schematics = await listSchematics(devUserId);
    setSchematicList(schematics);
    if (
      selectedSavedSchematicId &&
      !schematics.some((schematic) => schematic.id === selectedSavedSchematicId)
    ) {
      setSelectedSavedSchematicId("");
    }
    setStatusMessage(
      schematics.length === 0
        ? "No saved schematics in this browser"
        : `Found ${schematics.length} saved schematic${schematics.length === 1 ? "" : "s"}`,
    );
  }

  async function loadSchematic(schematicId: string) {
    if (!schematicId) return;
    const loaded = await loadStoredSchematic<SchematicModel>(
      devUserId,
      schematicId,
    );
    if (!loaded) {
      setStatusMessage("That saved schematic is no longer available");
      return;
    }
    setModel(fromApiPayload(loaded));
    setSelection([]);
    setHistory({ past: [], future: [] });
    setShowAllErrors(false);
    setLastSavedSnapshot(JSON.stringify(toApiPayload(fromApiPayload(loaded))));
    setStatusMessage(`Loaded "${loaded.name}"`);
  }

  async function deleteSchematic() {
    if (!model.id) return;
    setPendingSavedDelete(model.id);
  }

  async function confirmDeleteSchematic() {
    if (!pendingSavedDelete) return;
    const deleted = await deleteStoredSchematic(devUserId, pendingSavedDelete);
    if (!deleted) {
      setStatusMessage("That saved schematic was already deleted");
      setPendingSavedDelete(null);
      return;
    }
    const blank = defaultModel();
    setModel(blank);
    setSelection([]);
    setHistory({ past: [], future: [] });
    setLastSavedSnapshot(JSON.stringify(toApiPayload(blank)));
    setSelectedSavedSchematicId("");
    setPendingSavedDelete(null);
    setStatusMessage("Saved schematic deleted from this browser");
    void loadSchematicList();
  }

  function exportJson() {
    download(
      `${model.name}.json`,
      "application/json",
      JSON.stringify(toApiPayload(model), null, 2),
    );
  }

  function exportCsv() {
    // Feature 1 has no simulation yet, so computed CSV columns are present but blank.
    const rows = [
      [
        "kind",
        "id",
        "label",
        "type",
        "from",
        "to",
        "x",
        "y",
        "flow_rate",
        "pressure_head",
        "headloss",
      ],
      ...model.nodes.map((node) => [
        "NODE",
        node.id,
        node.label,
        node.type,
        "",
        "",
        String(node.x),
        String(node.y),
        "",
        "",
        "",
      ]),
      ...model.links.map((link) => [
        "LINK",
        link.id,
        link.label,
        link.type,
        link.from_node_id ?? "",
        link.to_node_id ?? "",
        "",
        "",
        "",
        "",
        "",
      ]),
    ];
    download(
      `${model.name}.csv`,
      "text/csv",
      rows.map((row) => row.map(csvCell).join(",")).join("\n"),
    );
  }

  function exportSvg() {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    download(
      `${model.name}.svg`,
      "image/svg+xml",
      new XMLSerializer().serializeToString(clone),
    );
  }

  function exportPng() {
    // PNG export rasterizes the same SVG used on-screen, keeping symbols and labels
    // aligned with the current canvas view.
    const svg = svgRef.current;
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = svg.clientWidth;
      canvas.height = svg.clientHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#f1f5f9";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        if (png) downloadBlob(`${model.name}.png`, png);
      });
    };
    image.src = url;
  }

  const selectionBox =
    dragState?.kind === "select"
      ? normalizeBox(dragState.start, dragState.current)
      : null;

  return (
    <main className="flex h-screen min-h-180 flex-col overflow-hidden bg-slate-100 text-slate-950">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-300 bg-white px-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded border border-cyan-700 bg-cyan-700 text-sm font-bold text-white">
            A
          </div>
          <div className="min-w-0">
            <input
              value={model.name}
              onChange={(event) =>
                commit((draft) => ({ ...draft, name: event.target.value }))
              }
              className="w-52 rounded border border-transparent px-1 text-sm font-semibold focus:border-cyan-700 focus:outline-none"
              aria-label="Schematic name"
            />
            <p className="truncate text-xs text-slate-500">{statusMessage}</p>
          </div>
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
              className="h-8 w-9 rounded border border-slate-300 bg-white"
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
          <details className="relative">
            <summary className="flex h-8 cursor-pointer list-none items-center rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:border-cyan-700 hover:text-cyan-800">
              Strainer settings
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-64 rounded border border-slate-300 bg-white p-3 shadow-lg">
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
          </details>
        </div>

        <div className="flex items-center gap-2">
          <label
            className="text-xs font-medium text-slate-500"
            htmlFor="dev-user"
          >
            User
          </label>
          <input
            id="dev-user"
            value={devUserId}
            onChange={(event) => setDevUserId(event.target.value)}
            className="h-8 w-24 rounded border border-slate-300 px-2 text-xs"
          />
          <ToolbarButton label="List" onClick={loadSchematicList} />
          <ToolbarButton label="Save" onClick={saveSchematic} />
          <ToolbarButton
            label="Delete"
            disabled={!model.id}
            onClick={deleteSchematic}
          />
        </div>
      </header>

      {recoveryCandidate && (
        <div className="flex shrink-0 items-center justify-between border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
          <span>A local draft is available from this browser.</span>
          <div className="flex items-center gap-2">
            <ToolbarButton
              label="Restore local draft"
              onClick={restoreRecoveryDraft}
            />
            <ToolbarButton
              label="Discard draft"
              onClick={discardRecoveryDraft}
            />
          </div>
        </div>
      )}

      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `280px minmax(0, 1fr) ${rightPanelWidth}px`,
        }}
      >
        <aside className="flex min-h-0 flex-col border-r border-slate-300 bg-white">
          <PanelHeader
            title="Element Palette"
            detail="Click or drag onto canvas"
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <PaletteGroup
              title="Nodes"
              tools={nodeTools}
              activeTool={activeTool}
              onPick={setActiveTool}
            />
            <PaletteGroup
              title="Links"
              tools={linkTools}
              activeTool={activeTool}
              onPick={setActiveTool}
            />

            <section className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Parameter Labels
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-2">
                {Object.entries(model.visibility).map(([key, value]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-sm capitalize"
                  >
                    <span>{key}</span>
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={() =>
                        setModel((current) => ({
                          ...current,
                          visibility: { ...current.visibility, [key]: !value },
                        }))
                      }
                      className="h-4 w-4 accent-cyan-700"
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="mt-4 rounded border border-slate-200 bg-white p-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Saved Schematics
              </h2>
              <select
                className="mt-3 h-9 w-full rounded border border-slate-300 text-sm"
                onChange={(event) =>
                  setSelectedSavedSchematicId(event.target.value)
                }
                value={selectedSavedSchematicId}
                aria-label="Saved schematic"
              >
                <option value="">Select to load</option>
                {schematicList.map((schematic) => (
                  <option key={schematic.id} value={schematic.id}>
                    {schematic.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedSavedSchematicId}
                onClick={() => loadSchematic(selectedSavedSchematicId)}
                className="mt-2 h-8 w-full rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:border-cyan-700 hover:text-cyan-800 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
              >
                Load selected schematic
              </button>
            </section>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col bg-slate-200">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-300 bg-slate-50 px-3">
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span className="font-medium text-slate-800">Canvas</span>
              <span>Wheel: zoom</span>
              <span>Space+drag: pan</span>
              <span>Shift+click: multi-select</span>
            </div>
            <div className="flex items-center gap-2">
              <ToolbarButton label="PNG" onClick={exportPng} />
              <ToolbarButton label="SVG" onClick={exportSvg} />
              <ToolbarButton label="CSV" onClick={exportCsv} />
              <ToolbarButton label="JSON" onClick={exportJson} />
            </div>
          </div>

          <div
            ref={canvasRef}
            className={`relative min-h-0 flex-1 overflow-hidden outline-none ${cursorClass}`}
            role="application"
            tabIndex={0}
            aria-label="Schematic builder canvas"
            onWheel={(event) => {
              event.preventDefault();
              nudgeZoom(event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const tool = event.dataTransfer.getData(
                "application/audrolics-tool",
              ) as ToolType;
              const point = screenToWorld(event.clientX, event.clientY);
              if (isNodeTool(tool)) createNode(tool, point);
              if (isLinkTool(tool)) {
                const node = nearestNode(point);
                if (node)
                  setPendingLink({
                    type: tool,
                    fromNodeId: node.id,
                    cursor: point,
                  });
                setActiveTool(tool);
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
          >
            <svg
              ref={svgRef}
              className="h-full w-full select-none bg-slate-100"
            >
              <defs>
                <pattern
                  id="minor-grid"
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 24 0 L 0 0 0 24"
                    fill="none"
                    stroke="#d9e2ea"
                    strokeWidth="1"
                  />
                </pattern>
                <pattern
                  id="major-grid"
                  width="120"
                  height="120"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="120" height="120" fill="url(#minor-grid)" />
                  <path
                    d="M 120 0 L 0 0 0 120"
                    fill="none"
                    stroke="#b8c6d2"
                    strokeWidth="1.25"
                  />
                </pattern>
              </defs>
              <g transform={transform}>
                <rect
                  x="-2400"
                  y="-1800"
                  width="4800"
                  height="3600"
                  fill="url(#major-grid)"
                />
                {model.links.map((link) => (
                  <LinkShape
                    key={link.id}
                    link={link}
                    model={model}
                    selected={selection.some(
                      (item) => item.kind === "link" && item.id === link.id,
                    )}
                    onPointerDown={handleLinkPointerDown}
                    onContextMenu={(event) =>
                      openElementContextMenu(event, {
                        kind: "link",
                        id: link.id,
                      })
                    }
                  />
                ))}
                {pendingLink && (
                  <PendingLink model={model} pendingLink={pendingLink} />
                )}
                {model.nodes.map((node) => (
                  <NodeShape
                    key={node.id}
                    node={node}
                    model={model}
                    selected={selection.some(
                      (item) => item.kind === "node" && item.id === node.id,
                    )}
                    onPointerDown={handleNodePointerDown}
                    onPointerUp={handleNodeClick}
                    onContextMenu={(event) =>
                      openElementContextMenu(event, {
                        kind: "node",
                        id: node.id,
                      })
                    }
                  />
                ))}
                {selectionBox && (
                  <rect
                    x={selectionBox.x}
                    y={selectionBox.y}
                    width={selectionBox.width}
                    height={selectionBox.height}
                    fill="rgba(14,116,144,0.08)"
                    stroke="#0e7490"
                    strokeDasharray="6 4"
                  />
                )}
              </g>
            </svg>
          </div>
        </section>

        <aside className="relative flex min-h-0 flex-col border-l border-slate-300 bg-white">
          <button
            type="button"
            aria-label="Resize properties panel"
            className="absolute left-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-cyan-600"
            onPointerDown={() => setIsResizingPanel(true)}
          />
          <PanelHeader
            title="Properties"
            detail={
              selection.length === 0
                ? "No element selected"
                : `${selection.length} selected`
            }
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {selection.length !== 1 && (
              <EmptyProperties selectionCount={selection.length} />
            )}
            {selectedNode && (
              <ElementForm
                elementId={selectedNode.id}
                label={selectedNode.label}
                type={selectedNode.type}
                params={selectedNode.input_params}
                computed={selectedNode.computed}
                touched={touched}
                errors={validation}
                showAllErrors={showAllErrors}
                onTouch={(field) =>
                  setTouched((current) => new Set(current).add(field))
                }
                onRename={renameSelected}
                onParamChange={(key, value) =>
                  updateNodeParam(selectedNode.id, key, value)
                }
              />
            )}
            {selectedLink && (
              <ElementForm
                elementId={selectedLink.id}
                label={selectedLink.label}
                type={selectedLink.type}
                params={selectedLink.input_params}
                computed={selectedLink.computed}
                touched={touched}
                errors={validation}
                showAllErrors={showAllErrors}
                onTouch={(field) =>
                  setTouched((current) => new Set(current).add(field))
                }
                onRename={renameSelected}
                onParamChange={(key, value) =>
                  updateLinkParam(selectedLink.id, key, value)
                }
              />
            )}
          </div>
        </aside>
      </div>

      {contextMenu && (
        <div
          className="fixed z-30 w-44 rounded border border-slate-300 bg-white p-1 text-sm shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={deleteContextSelection}
            className="w-full rounded px-3 py-2 text-left text-slate-700 hover:bg-red-50 hover:text-red-700"
          >
            Delete element
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => setContextMenu(null)}
            className="w-full rounded px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
          >
            Keep element
          </button>
        </div>
      )}

      {pendingSavedDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-6">
          <section className="w-full max-w-sm rounded border border-slate-300 bg-white p-5 shadow-lg">
            <h2 className="text-base font-semibold text-slate-950">
              Delete saved schematic?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This removes the saved copy from this browser. The action cannot
              be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <ToolbarButton
                label="Keep schematic"
                onClick={() => setPendingSavedDelete(null)}
              />
              <button
                type="button"
                onClick={confirmDeleteSchematic}
                className="h-8 rounded border border-red-700 bg-red-700 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-red-800 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-red-700"
              >
                Delete saved schematic
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function PaletteGroup({
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
    <section className="mb-4">
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
            className={`flex items-center gap-3 rounded border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 ${
              activeTool === tool.type
                ? "border-cyan-700 bg-cyan-50 text-cyan-950"
                : "border-slate-200 bg-white text-slate-800 hover:border-cyan-700"
            }`}
          >
            <span className="flex h-9 w-10 shrink-0 items-center justify-center rounded border border-slate-300 bg-slate-50 text-xs font-bold">
              {tool.code}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{tool.label}</span>
              <span className="block truncate text-xs text-slate-500">
                {tool.detail}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function NodeShape({
  node,
  model,
  selected,
  onPointerDown,
  onPointerUp,
  onContextMenu,
}: {
  node: BuilderNode;
  model: SchematicModel;
  selected: boolean;
  onPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    node: BuilderNode,
  ) => void;
  onPointerUp: (
    event: ReactPointerEvent<SVGGElement>,
    node: BuilderNode,
  ) => void;
  onContextMenu: (event: ReactMouseEvent<SVGGElement>) => void;
}) {
  const size = 18 * model.styling.symbol_size;
  return (
    <g
      data-element-id={node.id}
      className="cursor-pointer"
      onPointerDown={(event) => onPointerDown(event, node)}
      onPointerUp={(event) => onPointerUp(event, node)}
      onContextMenu={onContextMenu}
    >
      {node.type === "JUNCTION" && (
        <circle
          cx={node.x}
          cy={node.y}
          r={size / 2}
          fill="#e0f2fe"
          stroke="#075985"
          strokeWidth={selected ? 4 : 2}
        />
      )}
      {node.type === "RESERVOIR" && (
        <g>
          <polygon
            points={`${node.x},${node.y - size} ${node.x - size},${node.y + size} ${node.x + size},${node.y + size}`}
            fill="#ecfeff"
            stroke="#0e7490"
            strokeWidth={selected ? 4 : 2}
          />
          <line
            x1={node.x - size * 0.5}
            y1={node.y + size * 0.4}
            x2={node.x + size * 0.5}
            y2={node.y + size * 0.4}
            stroke="#0e7490"
            strokeWidth="2"
          />
        </g>
      )}
      {node.type === "TANK" && (
        <rect
          x={node.x - size}
          y={node.y - size * 0.7}
          width={size * 2}
          height={size * 1.4}
          rx="3"
          fill="#f0fdfa"
          stroke="#0f766e"
          strokeWidth={selected ? 4 : 2}
        />
      )}
      <text
        x={node.x + size + 4}
        y={node.y + 4}
        fill="#0f172a"
        fontSize="12"
        fontWeight="600"
      >
        {node.label}
      </text>
      {model.visibility.elevation &&
        (typeof node.input_params.elevation === "string" ||
          typeof node.input_params.elevation === "number") &&
        node.input_params.elevation !== "" && (
          <text
            x={node.x + size + 4}
            y={node.y + 18}
            fill="#64748b"
            fontSize="11"
          >
            Elev {node.input_params.elevation} m
          </text>
        )}
      {model.visibility.pressure &&
        node.computed.pressure_head !== null &&
        node.computed.pressure_head !== undefined && (
          <text
            x={node.x + size + 4}
            y={node.y + 32}
            fill="#64748b"
            fontSize="11"
          >
            Pressure {node.computed.pressure_head} m
          </text>
        )}
    </g>
  );
}

function LinkShape({
  link,
  model,
  selected,
  onPointerDown,
  onContextMenu,
}: {
  link: BuilderLink;
  model: SchematicModel;
  selected: boolean;
  onPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    link: BuilderLink,
  ) => void;
  onContextMenu: (event: ReactMouseEvent<SVGGElement>) => void;
}) {
  const from = model.nodes.find((node) => node.id === link.from_node_id);
  const to = model.nodes.find((node) => node.id === link.to_node_id);
  if (!from || !to) return null;
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const stroke = selected ? "#f97316" : model.styling.line_color;
  return (
    <g
      data-element-id={link.id}
      className="cursor-pointer"
      onPointerDown={(event) => onPointerDown(event, link)}
      onContextMenu={onContextMenu}
    >
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="transparent"
        strokeWidth="18"
      />
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={stroke}
        strokeWidth={
          selected
            ? model.styling.line_thickness + 2
            : model.styling.line_thickness
        }
      />
      <LinkSymbol link={link} mid={mid} />
      <text
        x={mid.x + 10}
        y={mid.y - 8}
        fill="#0f172a"
        fontSize="12"
        fontWeight="600"
      >
        {link.label}
      </text>
      {model.visibility.length &&
        typeof link.input_params.length === "string" &&
        link.input_params.length !== "" && (
          <text x={mid.x + 10} y={mid.y + 8} fill="#64748b" fontSize="11">
            {link.input_params.length} m
          </text>
        )}
      {model.visibility.diameter &&
        (typeof link.input_params.diameter === "string" ||
          typeof link.input_params.diameter === "number") &&
        link.input_params.diameter !== "" && (
          <text x={mid.x + 10} y={mid.y + 22} fill="#64748b" fontSize="11">
            Dia {link.input_params.diameter} mm
          </text>
        )}
      {model.visibility.flow &&
        link.computed.flow_rate !== null &&
        link.computed.flow_rate !== undefined && (
          <text x={mid.x + 10} y={mid.y + 36} fill="#64748b" fontSize="11">
            Flow {link.computed.flow_rate} L/s
          </text>
        )}
    </g>
  );
}

function LinkSymbol({ link, mid }: { link: BuilderLink; mid: Point }) {
  if (link.type === "PIPE")
    return <circle cx={mid.x} cy={mid.y} r="3" fill="#0f766e" />;
  if (link.type === "PUMP")
    return (
      <circle
        cx={mid.x}
        cy={mid.y}
        r="10"
        fill="#fff7ed"
        stroke="#c2410c"
        strokeWidth="2"
      />
    );
  if (link.type === "VALVE")
    return (
      <polygon
        points={`${mid.x - 10},${mid.y - 8} ${mid.x},${mid.y} ${mid.x - 10},${mid.y + 8} ${mid.x + 10},${mid.y + 8} ${mid.x},${mid.y} ${mid.x + 10},${mid.y - 8}`}
        fill="#fef3c7"
        stroke="#a16207"
        strokeWidth="2"
      />
    );
  return (
    <polygon
      points={`${mid.x},${mid.y - 12} ${mid.x + 12},${mid.y} ${mid.x},${mid.y + 12} ${mid.x - 12},${mid.y}`}
      fill="#f8fafc"
      stroke="#475569"
      strokeDasharray="3 2"
      strokeWidth="2"
    />
  );
}

function PendingLink({
  model,
  pendingLink,
}: {
  model: SchematicModel;
  pendingLink: { fromNodeId: string; cursor: Point };
}) {
  const from = model.nodes.find((node) => node.id === pendingLink.fromNodeId);
  if (!from) return null;
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={pendingLink.cursor.x}
      y2={pendingLink.cursor.y}
      stroke="#f97316"
      strokeWidth="2"
      strokeDasharray="8 6"
    />
  );
}

function ElementForm(props: {
  elementId: string;
  label: string;
  type: NodeType | LinkType;
  params: InputParams;
  computed: ComputedValues;
  touched: Set<string>;
  errors: Record<string, string>;
  showAllErrors: boolean;
  onTouch: (field: string) => void;
  onRename: (value: string) => void;
  onParamChange: (key: string, value: FieldValue) => void;
}) {
  const fields = fieldsForType(props.type, props.params);
  return (
    <div className="space-y-4">
      <section className="rounded border border-slate-200 bg-white p-4">
        <label className="text-xs font-medium text-slate-500">Label</label>
        <input
          value={props.label}
          onChange={(event) => props.onRename(event.target.value)}
          className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm"
        />
        <p className="mt-2 text-xs text-slate-500">{props.type}</p>
      </section>

      <section className="rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Input Parameters
          </h2>
        </div>
        <div className="space-y-3 p-4">
          {fields.map((field) => (
            <FieldControl
              key={field.key}
              elementId={props.elementId}
              field={field}
              value={props.params[field.key]}
              error={props.errors[`${props.elementId}.${field.key}`]}
              touched={props.touched}
              showAllErrors={props.showAllErrors}
              onTouch={props.onTouch}
              onChange={(value) => props.onParamChange(field.key, value)}
            />
          ))}
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-slate-100">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Computed Results
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Read-only until simulation is implemented.
          </p>
        </div>
        <div className="space-y-2 p-4">
          {Object.keys(computedForType(props.type)).map((key) => (
            <div
              key={key}
              className="flex justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
            >
              <span className="font-medium text-slate-600">
                {labelize(key)}
              </span>
              <span className="text-slate-400">Pending</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

type FieldDef =
  | { key: string; label: string; kind: "number" | "text"; unit?: string }
  | { key: string; label: string; kind: "select"; options: string[] }
  | { key: string; label: string; kind: "curve"; yKey: "head" | "headloss" };

function FieldControl(props: {
  elementId: string;
  field: FieldDef;
  value: FieldValue;
  error?: string;
  touched: Set<string>;
  showAllErrors: boolean;
  onTouch: (field: string) => void;
  onChange: (value: FieldValue) => void;
}) {
  const fieldKey = `${props.elementId}.${props.field.key}`;
  // Blank required fields are allowed while placing elements; errors become
  // visible after the user touches a field or presses Save.
  const showError =
    props.error && (props.showAllErrors || props.touched.has(fieldKey));
  if (props.field.kind === "select") {
    return (
      <label className="block">
        <span className="text-xs font-medium text-slate-500">
          {props.field.label}
        </span>
        <select
          value={String(props.value ?? "")}
          onBlur={() => props.onTouch(fieldKey)}
          onChange={(event) => props.onChange(event.target.value)}
          className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm"
        >
          <option value="">Select</option>
          {props.field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {showError && (
          <p className="mt-1 text-xs text-red-600">{props.error}</p>
        )}
      </label>
    );
  }
  if (props.field.kind === "curve") {
    const curveField = props.field;
    const yKey = curveField.yKey;
    const points = Array.isArray(props.value) ? props.value : [];
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">
            {props.field.label}
          </span>
          <button
            type="button"
            onClick={() =>
              props.onChange([...points, { flow: "", [yKey]: "" }])
            }
            className="rounded border border-slate-300 px-2 py-1 text-xs"
          >
            Add row
          </button>
        </div>
        <div className="space-y-2">
          {points.map((point, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input
                placeholder="Flow"
                value={point.flow}
                onChange={(event) =>
                  props.onChange(
                    points.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, flow: event.target.value }
                        : item,
                    ),
                  )
                }
                onBlur={() => props.onTouch(fieldKey)}
                className="h-8 rounded border border-slate-300 px-2 text-xs"
              />
              <input
                placeholder={yKey}
                value={point[yKey] ?? ""}
                onChange={(event) =>
                  props.onChange(
                    points.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, [yKey]: event.target.value }
                        : item,
                    ),
                  )
                }
                onBlur={() => props.onTouch(fieldKey)}
                className="h-8 rounded border border-slate-300 px-2 text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  props.onChange(
                    points.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
                className="rounded border border-slate-300 px-2 text-xs"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <CurvePreview points={points} yKey={yKey} />
        {showError && (
          <p className="mt-1 text-xs text-red-600">{props.error}</p>
        )}
      </div>
    );
  }
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">
        {props.field.label}
        {props.field.unit ? ` (${props.field.unit})` : ""}
      </span>
      <input
        type={props.field.kind === "number" ? "number" : "text"}
        value={
          typeof props.value === "string" || typeof props.value === "number"
            ? props.value
            : ""
        }
        onBlur={() => props.onTouch(fieldKey)}
        onChange={(event) => props.onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm"
      />
      {showError && <p className="mt-1 text-xs text-red-600">{props.error}</p>}
    </label>
  );
}

function CurvePreview({
  points,
  yKey,
}: {
  points: CurvePoint[];
  yKey: "head" | "headloss";
}) {
  const parsed = points
    .map((point) => ({ x: Number(point.flow), y: Number(point[yKey]) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (parsed.length < 2)
    return (
      <div className="mt-2 h-20 rounded border border-dashed border-slate-300 bg-slate-50" />
    );
  const maxX = Math.max(...parsed.map((point) => point.x), 1);
  const maxY = Math.max(...parsed.map((point) => point.y), 1);
  const d = parsed
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${(point.x / maxX) * 140 + 10} ${70 - (point.y / maxY) * 60}`,
    )
    .join(" ");
  return (
    <svg className="mt-2 h-20 w-full rounded border border-slate-200 bg-slate-50">
      <path d={d} fill="none" stroke="#0f766e" strokeWidth="2" />
    </svg>
  );
}

function EmptyProperties({ selectionCount }: { selectionCount: number }) {
  return (
    <section className="rounded border border-dashed border-slate-300 bg-slate-50 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Selection</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {selectionCount === 0
          ? "Select an element to edit its Section 3 input parameters."
          : "Multiple elements selected. Move, copy, delete, or use a single selection for properties."}
      </p>
    </section>
  );
}

function ToolbarButton({
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
      className="h-8 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:border-cyan-700 hover:text-cyan-800 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
    >
      {label}
    </button>
  );
}

function PanelHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function fieldsForType(
  type: NodeType | LinkType,
  params: InputParams,
): FieldDef[] {
  // This is the frontend mirror of SRS Section 3.1. The backend validates the
  // same concepts before persistence.
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

function defaultNodeParams(type: NodeType): InputParams {
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

function defaultLinkParams(type: LinkType): InputParams {
  if (type === "PIPE")
    return {
      length: "",
      diameter: "",
      roughness: "",
      minor_loss_coeff: "",
      status: "",
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

function defaultNodeComputed(type: NodeType): ComputedValues {
  if (type === "JUNCTION") return { pressure_head: null, actual_demand: null };
  if (type === "RESERVOIR") return { outflow: null };
  return { hydraulic_head: null, current_volume: null };
}

function defaultLinkComputed(type: LinkType): ComputedValues {
  if (type === "PIPE")
    return {
      flow_rate: null,
      velocity: null,
      headloss: null,
      unit_headloss: null,
    };
  if (type === "PUMP") return { flow: null, head_added: null, energy: null };
  if (type === "VALVE") return { flow: null, pressure_drop: null };
  return { headloss: null };
}

function computedForType(type: NodeType | LinkType): ComputedValues {
  return isNodeTool(type)
    ? defaultNodeComputed(type)
    : defaultLinkComputed(type);
}

function nextLabel(type: ToolType, model: SchematicModel): string {
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

function validateModel(model: SchematicModel): Record<string, string> {
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
      validateField(
        `${link.id}.${field.key}`,
        field,
        link.input_params[field.key],
        errors,
      );
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

function toApiPayload(model: SchematicModel) {
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

function fromApiPayload(
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

function normalizeParams(params: InputParams): InputParams {
  // Form inputs stay as strings for editing. API payloads convert numeric-looking
  // values so backend validation receives numbers instead of DOM strings.
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
        typeof value === "string" &&
        value !== "" &&
        Number.isFinite(Number(value))
      )
        return [key, Number(value)];
      return [key, value];
    }),
  );
}

function updateLinkPointsForNodes(links: BuilderLink[], nodes: BuilderNode[]) {
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

function toggleSelection(selection: Selection[], item: Selection) {
  const exists = selection.some(
    (selected) => selected.kind === item.kind && selected.id === item.id,
  );
  return exists
    ? selection.filter(
        (selected) => !(selected.kind === item.kind && selected.id === item.id),
      )
    : [...selection, item];
}

function normalizeBox(start: Point, current: Point) {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function labelize(key: string) {
  return key.replaceAll("_", " ");
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function download(filename: string, type: string, content: string) {
  downloadBlob(filename, new Blob([content], { type }));
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.replaceAll(" ", "-").toLowerCase();
  anchor.click();
  URL.revokeObjectURL(url);
}
