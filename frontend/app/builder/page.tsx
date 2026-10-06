
"use client";

// The page connects document state, canvas gestures, persistence, and the
// surrounding builder components.
import {
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "./builder.css";
import { currentAccountId } from "@/lib/session";
import BuilderModals, { type BuilderErrorItem } from "./builder-modals";
import {
  defaultModel, isNodeTool, isLinkTool, clamp, id,
  MIN_ZOOM, MAX_ZOOM, ZOOM_STEP, SNAP_PX, HISTORY_LIMIT,
  type SchematicModel, type BuilderNode, type BuilderLink, type Selection,
  type ToolType, type LinkType, type NodeType, type Point, type DragState,
  type PanState, type ContextMenuState, type NavigationGuardState,
  type FieldValue, type Measurement,
} from "./builder-model";
import {
  defaultNodeParams, defaultLinkParams, defaultNodeComputed,
  defaultLinkComputed, nextLabel, validateModel, toApiPayload,
  toAnalysisPayload, fromApiPayload, updateLinkPointsForNodes,
  toggleSelection, normalizeBox, distance, csvCell,
} from "./builder-graph";
import { NodeShape, LinkShape, AnomalyOverlays, PendingLink } from "./builder-canvas";
import { nodeTools, linkTools, PaletteGroup } from "./builder-palette";
import { ElementForm, EmptyProperties } from "./builder-inspector";
import { BuilderToolbar, ToolbarButton, PanelHeader } from "./builder-controls";
import { useBuilderHistory } from "./use-builder-history";
import { useBuilderRecovery } from "./use-builder-recovery";
import { readRecoveryModel, recoveryKey } from "./builder-recovery";
import { fitToView } from "../../lib/builder-rules";
import {
  deleteSchematic as deleteStoredSchematic,
  loadSchematic as loadStoredSchematic,
  saveSchematic as saveStoredSchematic,
  runSimulationApi,
  detectAnomaliesApi,
  SchematicApiError,
  formatSchematicError,
  type ApiErrorDetail,
  type AnomalyApiResponse,
} from "../../lib/builder-storage";

function BuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Persistent document data and its undo history.
  const [selection, setSelection] = useState<Selection[]>([]);
  // Transient canvas modes: placement, connection, dragging, and panning.
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [pendingLink, setPendingLink] = useState<{
    type: LinkType;
    fromNodeId: string;
    cursor: Point;
  } | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [panState, setPanState] = useState<PanState | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  // Inspector validation and user-facing status do not belong in the saved graph.
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready to build");
  const { model, setModel, history, setHistory, commit, undo, redo } = useBuilderHistory(setStatusMessage);
  const { recoveryCandidate, setRecoveryCandidate, setLastSavedSnapshot, isDirty } = useBuilderRecovery(model);
  const [rightPanelWidth, setRightPanelWidth] = useState(260);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  // Recovery, navigation, and API operations are separate from graph editing.
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [pendingSavedDelete, setPendingSavedDelete] = useState<string | null>(
    null,
  );
  const [navigationGuard, setNavigationGuard] =
    useState<NavigationGuardState>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorModalTitle, setErrorModalTitle] = useState("Unable to save schematic");
  const [errorModalItems, setErrorModalItems] = useState<BuilderErrorItem[]>([]);
  const [errorModalGeneral, setErrorModalGeneral] = useState<string[]>([]);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [anomalyRunning, setAnomalyRunning] = useState(false);
  const [anomalyResult, setAnomalyResult] = useState<AnomalyApiResponse | null>(
    null,
  );
  const [hoveredAnomaly, setHoveredAnomaly] = useState<number | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Node dragging updates live without pushing every pointer move into history.
  // The starting snapshot is committed once on pointer-up.
  const dragStartModelRef = useRef<SchematicModel | null>(null);

  // Only one selected element has editable properties; multi-selection remains
  // available for canvas actions such as copy and delete.
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

  const nudgeZoom = useCallback((delta: number) => {
    setModel((current) => ({
      ...current,
      canvas_state: {
        ...current.canvas_state,
        zoom: clamp(current.canvas_state.zoom + delta, MIN_ZOOM, MAX_ZOOM),
      },
    }));
  }, [setModel]);

  // Deep-link loading on mount
  useEffect(() => {
    const schematicId = searchParams.get("id");
    if (schematicId) {
      void performLoadSchematic(schematicId);
    }
    // Keep the first client render identical to SSR, then offer recovery.
    const timeout = window.setTimeout(() => {
      const recovered = readRecoveryModel();
      if (recovered) setRecoveryCandidate(recovered);
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isResizingPanel) return;
    const onMove = (event: PointerEvent) => {
      setRightPanelWidth(clamp(window.innerWidth - event.clientX, 220, 400));
    };
    const onUp = () => setIsResizingPanel(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [isResizingPanel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      nudgeZoom(event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [nudgeZoom]);

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
    window.localStorage.removeItem(recoveryKey());
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

  function hasOverlappingLink(fromNodeId: string, toNodeId: string): boolean {
    return model.links.some(
      (link) =>
        (link.from_node_id === fromNodeId && link.to_node_id === toNodeId) ||
        (link.from_node_id === toNodeId && link.to_node_id === fromNodeId),
    );
  }

  function cancelPendingLink(message?: string) {
    setPendingLink(null);
    setActiveTool(null);
    if (message) setStatusMessage(message);
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
    const isDuplicate = hasOverlappingLink(fromNodeId, toNodeId);
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
    if (isDuplicate) {
      setStatusMessage("Warning: duplicate path detected.");
    }
  }

  // Pointer handlers route each gesture through one canvas mode. Keeping those
  // modes here prevents the SVG symbols from duplicating graph edit logic.
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
      if (pendingLink) {
        cancelPendingLink("Link cancelled — E102: dangling endpoint. Snap to a node.");
      }
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
      if (pendingLink) cancelPendingLink();
      createNode(activeTool, world);
      return;
    }
    if (event.button === 0) {
      if (pendingLink) {
        cancelPendingLink("Link cancelled — E102: dangling endpoint. Snap to a node.");
      }
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
      if (target) {
        createLink(pendingLink.type, pendingLink.fromNodeId, target.id);
      } else {
        cancelPendingLink("Link cancelled — E102: dangling endpoint. Snap to a node.");
      }
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
    if (pendingLink && node.id === pendingLink.fromNodeId) {
      cancelPendingLink("Link cancelled — cannot connect a node to itself.");
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
    if (event.key === "Escape") {
      // Let modal dialogs handle their own Esc; cancel canvas interactions otherwise.
      if (
        navigationGuard !== null ||
        saveModalOpen ||
        errorModalOpen ||
        pendingSavedDelete !== null
      ) {
        return;
      }
      if (pendingLink) {
        event.preventDefault();
        cancelPendingLink("Link cancelled.");
        setContextMenu(null);
        return;
      }
      if (contextMenu) {
        event.preventDefault();
        setContextMenu(null);
        return;
      }
      if (activeTool) {
        event.preventDefault();
        setActiveTool(null);
        return;
      }
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
    // Removing a node also removes every link attached to it.
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

  // --- Navigation Guard ---

  function guardedStartNewSchematic() {
    if (isDirty) {
      setNavigationGuard({ kind: "new" });
      return;
    }
    performStartNewSchematic();
  }

  function guardedNavigate(href: string) {
    if (isDirty) {
      setNavigationGuard({ kind: "navigate", href });
      return;
    }
    router.push(href);
  }

  function performStartNewSchematic() {
    const blank = defaultModel();
    setModel(blank);
    setSelection([]);
    setHistory({ past: [], future: [] });
    setShowAllErrors(false);
    setLastSavedSnapshot(JSON.stringify(toApiPayload(blank)));
    setStatusMessage("Started a new unsaved schematic");
    setNavigationGuard(null);
    // Clear query param if present
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("id")) {
        url.searchParams.delete("id");
        router.replace(url.pathname + url.search);
      }
    }
  }

  async function performLoadSchematic(schematicId: string) {
    if (!schematicId) return;
    try {
      const loaded = await loadStoredSchematic<SchematicModel>(
        currentAccountId(),
        schematicId,
      );
      if (!loaded) {
        setStatusMessage("That saved schematic is no longer available");
        setNavigationGuard(null);
        return;
      }
      const loadedModel = fromApiPayload(loaded);
      setModel(loadedModel);
      setSelection([]);
      setHistory({ past: [], future: [] });
      setShowAllErrors(false);
      setLastSavedSnapshot(JSON.stringify(toApiPayload(loadedModel)));
      setStatusMessage(`Loaded "${loaded.name}" from the backend database`);
      setNavigationGuard(null);
      // Update URL without full navigation
      router.replace(`/builder?id=${encodeURIComponent(schematicId)}`);
    } catch (error) {
      setStatusMessage(formatSchematicError(error, "Unable to load schematic"));
      setNavigationGuard(null);
    }
  }

  function performDiscardAndNavigate() {
    window.localStorage.removeItem(recoveryKey());
    if (!navigationGuard) return;
    if (navigationGuard.kind === "new") {
      performStartNewSchematic();
    } else if (navigationGuard.kind === "load") {
      void performLoadSchematic(navigationGuard.id);
    } else if (navigationGuard.kind === "navigate") {
      router.push(navigationGuard.href);
    }
  }

  async function performSaveAndContinue() {
    const success = await attemptSaveSchematic();
    if (!success) return;
    if (!navigationGuard) return;
    if (navigationGuard.kind === "new") {
      performStartNewSchematic();
    } else if (navigationGuard.kind === "load") {
      void performLoadSchematic(navigationGuard.id);
    } else if (navigationGuard.kind === "navigate") {
      router.push(navigationGuard.href);
    }
  }

  // --- Save & Validation ---

  async function saveSchematic() {
    const success = await attemptSaveSchematic();
    setSaveModalOpen(false);
    if (success) {
      setStatusMessage(`Saved "${model.name}" to the backend database`);
    }
  }

  async function attemptSaveSchematic(): Promise<boolean> {
    setShowAllErrors(false);
    try {
      const saved = await saveStoredSchematic(currentAccountId(), toApiPayload(model));
      const savedModel = fromApiPayload(saved);
      setModel(savedModel);
      setHistory({ past: [], future: [] });
      setLastSavedSnapshot(JSON.stringify(toApiPayload(savedModel)));
      setErrorModalItems([]);
      setErrorModalGeneral([]);
      return true;
    } catch (error) {
      const general: string[] = [];
      const items: BuilderErrorItem[] = [];
      if (error instanceof SchematicApiError && error.detail) {
        const parsed = parseApiErrorDetail(error.detail);
        general.push(...parsed.general);
        items.push(...parsed.items);
      } else {
        general.push(formatSchematicError(error, "Unable to save schematic"));
      }
      setErrorModalTitle("Unable to save schematic");
      setErrorModalItems(items);
      setErrorModalGeneral(general);
      setErrorModalOpen(true);
      return false;
    }
  }

  function buildSaveErrorItems(
    errors: Record<string, string>,
  ): BuilderErrorItem[] {
    const items: BuilderErrorItem[] = [];
    for (const [path, message] of Object.entries(errors)) {
      const [elementId, field] = path.split(".", 2);
      if (!elementId || !field) continue;
      const node = model.nodes.find((n) => n.id === elementId);
      const link = model.links.find((l) => l.id === elementId);
      if (node) {
        items.push({
          elementId,
          label: node.label,
          type: node.type,
          field,
          message,
          kind: "node",
        });
      } else if (link) {
        items.push({
          elementId,
          label: link.label,
          type: link.type,
          field,
          message,
          kind: "link",
        });
      }
    }
    return items;
  }

  function parseApiErrorDetail(detail: ApiErrorDetail): {
    general: string[];
    items: BuilderErrorItem[];
  } {
    const general: string[] = [];
    const items: BuilderErrorItem[] = [];
    if (typeof detail === "string") {
      general.push(detail);
    } else if (Array.isArray(detail)) {
      for (const entry of detail) {
        if (entry.msg) general.push(entry.msg);
      }
    } else if (detail && typeof detail === "object") {
      if (detail.message) {
        general.push(`[${detail.error_code ?? "E???"}] ${detail.message}`);
      }
      if (detail.element_id) {
        const node = model.nodes.find((n) => n.id === detail.element_id);
        const link = model.links.find((l) => l.id === detail.element_id);
        if (node || link) {
          const el = node ?? link!;
          items.push({
            elementId: detail.element_id,
            label: el.label,
            type: el.type,
            field: detail.attribute ?? "",
            message: detail.message ?? "",
            kind: node ? "node" : "link",
          });
        }
      }
    }
    return { general, items };
  }

  function handleSaveErrorItemClick(item: BuilderErrorItem) {
    setSelection([{ kind: item.kind, id: item.elementId }]);
    setErrorModalOpen(false);
  }

  function showErrorModal(title: string, error: unknown) {
    const general: string[] = [];
    const items: BuilderErrorItem[] = [];
    if (error instanceof SchematicApiError && error.detail) {
      const parsed = parseApiErrorDetail(error.detail);
      general.push(...parsed.general);
      items.push(...parsed.items);
    } else {
      general.push(formatSchematicError(error, title));
    }
    setErrorModalTitle(title);
    setErrorModalItems(items);
    setErrorModalGeneral(general);
    setErrorModalOpen(true);
  }

  // Solver responses update computed values only. They do not modify inputs or
  // enter undo history, because the result can be recalculated from the graph.
  function applySimulationResult(result: {
    node_results: Array<Record<string, number | null | string> & { id: string }>;
    link_results: Array<Record<string, number | null | string> & { id: string }>;
  }) {
    setModel((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        const found = result.node_results.find((n) => n.id === node.id);
        if (!found) return node;
        const computed = Object.fromEntries(Object.entries(found).filter(([key]) => key !== "id"));
        return { ...node, computed: { ...node.computed, ...(computed as Record<string, number | null>) } };
      }),
      links: current.links.map((link) => {
        const found = result.link_results.find((l) => l.id === link.id);
        if (!found) return link;
        const computed = Object.fromEntries(Object.entries(found).filter(([key]) => key !== "id"));
        return { ...link, computed: { ...link.computed, ...(computed as Record<string, number | null>) } };
      }),
    }));
  }

  async function runSimulation() {
    setShowAllErrors(true);
    const validationErrors = validateModel(model);
    if (Object.keys(validationErrors).length > 0) {
      setErrorModalTitle("Unable to run simulation");
      setErrorModalItems(buildSaveErrorItems(validationErrors));
      setErrorModalGeneral([]);
      setErrorModalOpen(true);
      return;
    }
    setSimulationRunning(true);
    try {
      const result = await runSimulationApi(currentAccountId(), toAnalysisPayload(model));
      applySimulationResult(result);
      setAnomalyResult(null);
      setHoveredAnomaly(null);
      const warnings = result.warnings?.length ? ` (${result.warnings.length} warning(s))` : "";
      setStatusMessage(`Simulation complete in ${result.iterations} iterations${warnings}`);
    } catch (error) {
      showErrorModal("Unable to run simulation", error);
    } finally {
      setSimulationRunning(false);
    }
  }

  async function runAnomalyDetection() {
    setShowAllErrors(true);
    const validationErrors = validateModel(model);
    if (Object.keys(validationErrors).length > 0) {
      setErrorModalTitle("Unable to run anomaly detection");
      setErrorModalItems(buildSaveErrorItems(validationErrors));
      setErrorModalGeneral([]);
      setErrorModalOpen(true);
      return;
    }
    const nodeMeasurements = model.measurements.filter((m) => m.element_type === "NODE");
    const linkMeasurements = model.measurements.filter((m) => m.element_type === "LINK");
    if (nodeMeasurements.length + linkMeasurements.length < 1) {
      setErrorModalTitle("Unable to run anomaly detection");
      setErrorModalItems([]);
      setErrorModalGeneral(["Add at least one field measurement before running anomaly detection."]);
      setErrorModalOpen(true);
      return;
    }
    setAnomalyRunning(true);
    try {
      const result = await detectAnomaliesApi(currentAccountId(), {
        ...toAnalysisPayload(model),
        measurements: model.measurements.map((m) => ({
          ...m,
          type: m.measurement_type,
        })),
      });
      setAnomalyResult(result);
      setHoveredAnomaly(null);
      const segmentCount = result.suspect_segments.length;
      setStatusMessage(
        result.warnings.length > 0
          ? result.warnings.join(" ")
          : `Anomaly detection complete: ${result.flagged_points.length} flagged point(s), ${segmentCount} suspect segment(s)`,
      );
    } catch (error) {
      showErrorModal("Unable to run anomaly detection", error);
    } finally {
      setAnomalyRunning(false);
    }
  }

  function measurementForElement(elementId: string) {
    return model.measurements.find((m) => m.element_id === elementId) ?? null;
  }

  // Field readings are indexed by element so editing an existing reading
  // replaces it instead of creating a duplicate measurement.
  function setMeasurementForElement(
    elementId: string,
    elementType: "NODE" | "LINK",
    measurementType: "PRESSURE_HEAD" | "FLOW_RATE",
    value: number | null,
  ) {
    const unit = measurementType === "PRESSURE_HEAD" ? "m" : "L/s";
    setModel((current) => {
      const existingIndex = current.measurements.findIndex(
        (m) => m.element_id === elementId,
      );
      if (value === null) {
        if (existingIndex === -1) return current;
        return {
          ...current,
          measurements: current.measurements.filter((_, i) => i !== existingIndex),
        };
      }
      const next: Measurement = {
        id: existingIndex >= 0 ? current.measurements[existingIndex].id : id("measurement"),
        element_id: elementId,
        element_type: elementType,
        measurement_type: measurementType,
        value,
        unit,
      };
      if (existingIndex === -1) {
        return { ...current, measurements: [...current.measurements, next] };
      }
      const measurements = [...current.measurements];
      measurements[existingIndex] = next;
      return { ...current, measurements };
    });
  }

  function deleteSchematic() {
    if (!model.id) return;
    setPendingSavedDelete(model.id);
  }

  async function confirmDeleteSchematic() {
    if (!pendingSavedDelete) return;
    try {
      const deleted = await deleteStoredSchematic(
        currentAccountId(),
        pendingSavedDelete,
      );
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
      setPendingSavedDelete(null);
      setStatusMessage("Saved schematic deleted from the backend database");
      // Clear query param if present
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (url.searchParams.has("id")) {
          url.searchParams.delete("id");
          router.replace(url.pathname + url.search);
        }
      }
    } catch (error) {
      setStatusMessage(
        formatSchematicError(error, "Unable to delete schematic"),
      );
      setPendingSavedDelete(null);
    }
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

  async function exportSvg() {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      download(`${model.name}.svg`, "image/svg+xml", await serializeCanvasSvg(svg));
    } catch {
      setStatusMessage("Unable to export SVG symbols");
    }
  }

  async function exportPng() {
    // PNG export rasterizes the same SVG used on-screen, keeping symbols and labels
    // aligned with the current canvas view.
    const svg = svgRef.current;
    if (!svg) return;
    let data: string;
    try {
      data = await serializeCanvasSvg(svg);
    } catch {
      setStatusMessage("Unable to export PNG symbols");
      return;
    }
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
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setStatusMessage("Unable to render PNG export");
    };
    image.src = url;
  }

  const selectionBox =
    dragState?.kind === "select"
      ? normalizeBox(dragState.start, dragState.current)
      : null;


  // Page layout: command bar, optional recovery notice, then palette/canvas/
  // inspector columns. The canvas remains the only place that owns gestures.
  return (
    <main className="builder-page flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-100 text-slate-950">
      <BuilderToolbar
        model={model} setModel={setModel} history={history}
        statusMessage={statusMessage} isDirty={isDirty} commit={commit}
        undo={undo} redo={redo} nudgeZoom={nudgeZoom}
        updateZoom={updateZoom} fitDiagramToView={fitDiagramToView}
        guardedNavigate={guardedNavigate} guardedStartNewSchematic={guardedStartNewSchematic}
        setSaveModalOpen={setSaveModalOpen} setStatusMessage={setStatusMessage}
        deleteSchematic={deleteSchematic}
      />

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

      {/* Three work areas share the available height; only the inspector width is resizable. */}
      <div
        className="builder-workspace grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `clamp(180px, 15vw, 220px) minmax(0, 1fr) ${rightPanelWidth}px`,
        }}
      >
        <aside className="builder-palette flex min-h-0 flex-col border-r border-slate-300 bg-white">
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

            <section className="builder-visibility mt-4 rounded border border-slate-200 bg-[#f9faff] p-3">
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
          </div>
        </aside>

        <section className="builder-canvas flex min-w-0 flex-col bg-slate-200">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-300 bg-slate-50 px-3">
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span className="font-medium text-slate-800">Canvas</span>
              <span>Wheel: zoom</span>
              <span>Space+drag: pan</span>
              <span>Shift+click: multi-select</span>
              {isLinkTool(activeTool) && (
                <span className="text-cyan-700">
                  Links connect node-to-node. Use Junctions between inline devices.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ToolbarButton
                label={simulationRunning ? "Simulating…" : "Simulate"}
                disabled={simulationRunning}
                onClick={runSimulation}
              />
              <ToolbarButton
                label={anomalyRunning ? "Detecting…" : "Detect Anomalies"}
                disabled={anomalyRunning}
                onClick={runAnomalyDetection}
              />
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
            onDrop={(event) => {
              event.preventDefault();
              const tool = event.dataTransfer.getData(
                "application/audrolics-tool",
              ) as ToolType;
              const point = screenToWorld(event.clientX, event.clientY);
              if (isNodeTool(tool)) {
                if (pendingLink) cancelPendingLink();
                createNode(tool, point);
              }
              if (isLinkTool(tool)) {
                const node = nearestNode(point);
                if (node) {
                  setPendingLink({
                    type: tool,
                    fromNodeId: node.id,
                    cursor: point,
                  });
                  setActiveTool(tool);
                } else {
                  setStatusMessage("E102: dangling endpoint. Drop on a node.");
                }
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
            {/* One SVG provides both the live canvas and the SVG/PNG export source. */}
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
                {anomalyResult && (
                  <AnomalyOverlays
                    model={model}
                    anomalyResult={anomalyResult}
                    hovered={hoveredAnomaly}
                    onHover={setHoveredAnomaly}
                    layer="routes"
                  />
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
                {anomalyResult && (
                  <AnomalyOverlays
                    model={model}
                    anomalyResult={anomalyResult}
                    hovered={hoveredAnomaly}
                    onHover={setHoveredAnomaly}
                    layer="labels"
                  />
                )}
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

        <aside className="builder-inspector relative flex min-h-0 flex-col border-l border-slate-300 bg-white">
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
                errors={validation}
                showAllErrors={showAllErrors}
                onRename={renameSelected}
                onParamChange={(key, value) =>
                  updateNodeParam(selectedNode.id, key, value)
                }
                measurement={measurementForElement(selectedNode.id)}
                onMeasurementChange={(value) =>
                  setMeasurementForElement(
                    selectedNode.id,
                    "NODE",
                    "PRESSURE_HEAD",
                    value,
                  )
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
                errors={validation}
                showAllErrors={showAllErrors}
                onRename={renameSelected}
                onParamChange={(key, value) =>
                  updateLinkParam(selectedLink.id, key, value)
                }
                measurement={measurementForElement(selectedLink.id)}
                onMeasurementChange={(value) =>
                  setMeasurementForElement(
                    selectedLink.id,
                    "LINK",
                    "FLOW_RATE",
                    value,
                  )
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

      <BuilderModals
        save={{
          open: navigationGuard !== null || saveModalOpen,
          leaving: navigationGuard !== null,
          onClose: () => {
            setNavigationGuard(null);
            setSaveModalOpen(false);
          },
          onConfirm: () => void (navigationGuard ? performSaveAndContinue() : saveSchematic()),
          onDiscard: performDiscardAndNavigate,
        }}
        error={{
          open: errorModalOpen,
          title: errorModalTitle,
          items: errorModalItems,
          general: errorModalGeneral,
          onClose: () => setErrorModalOpen(false),
          onItemClick: handleSaveErrorItemClick,
        }}
        deletion={{
          open: pendingSavedDelete !== null,
          hasUnsavedChanges: isDirty && model.id === pendingSavedDelete,
          onClose: () => setPendingSavedDelete(null),
          onConfirm: () => void confirmDeleteSchematic(),
        }}
      />
    </main>
  );
}

// Standalone SVG files and PNG rasterization cannot rely on /public URLs.
// Inline each used symbol once in a cloned SVG; the live canvas keeps the
// lightweight URL references and remains unchanged.
async function serializeCanvasSvg(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(svg.clientWidth));
  clone.setAttribute("height", String(svg.clientHeight));
  clone.querySelector('g > rect[fill="url(#major-grid)"]')?.remove();

  const images = Array.from(clone.querySelectorAll("image[href]"));
  const sources = [...new Set(images.map((image) => image.getAttribute("href")))].filter(
    (src): src is string => Boolean(src?.startsWith("/")),
  );
  const embedded = new Map(
    await Promise.all(
      sources.map(async (src) => {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Unable to load symbol ${src}`);
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        return [src, dataUrl] as const;
      }),
    ),
  );
  for (const image of images) {
    const src = image.getAttribute("href");
    if (src && embedded.has(src)) image.setAttribute("href", embedded.get(src)!);
  }
  return new XMLSerializer().serializeToString(clone);
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

export default function BuilderPageWrapper() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-slate-100 text-slate-600">Loading builder…</div>}>
      <BuilderPage />
    </Suspense>
  );
}
