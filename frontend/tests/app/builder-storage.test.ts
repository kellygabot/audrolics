vi.mock("@/lib/session", () => ({ apiFetch: (path: string, init?: RequestInit) => fetch(path, init) }));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteSchematic,
  listSchematics,
  loadSchematic,
  saveSchematic,
} from "@/lib/builder-storage";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

describe("builder backend storage adapter", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists, loads, and deletes schematics through the backend API", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: "schematic-1",
            name: "Pump station segment",
            updated_at: "2026-08-25T00:00:00Z",
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "schematic-1",
          name: "Pump station segment",
          nodes: [],
          links: [],
          measurements: [],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(listSchematics("engineer-a")).resolves.toEqual([
      {
        id: "schematic-1",
        name: "Pump station segment",
        updated_at: "2026-08-25T00:00:00Z",
      },
    ]);
    await expect(loadSchematic("engineer-a", "schematic-1")).resolves.toMatchObject({
      id: "schematic-1",
      name: "Pump station segment",
    });
    await expect(deleteSchematic("engineer-a", "schematic-1")).resolves.toBe(true);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/schematics",
      expect.objectContaining({}),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/schematics/schematic-1",
      expect.objectContaining({}),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/schematics/schematic-1",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });

  it("posts new schematics and puts previously persisted schematics", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "schematic-1",
          name: "Pump station segment",
          nodes: [],
          links: [],
          measurements: [],
          created_at: "2026-08-25T00:00:00Z",
          updated_at: "2026-08-25T00:00:00Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "schematic-1",
          name: "Pump station segment",
          nodes: [],
          links: [],
          measurements: [],
          created_at: "2026-08-25T00:00:00Z",
          updated_at: "2026-08-25T00:01:00Z",
        }),
      );

    const created = await saveSchematic("engineer-a", {
      id: "schematic-local-draft",
      name: "Pump station segment",
      nodes: [],
      links: [],
      measurements: [],
    });
    const updated = await saveSchematic("engineer-a", created);

    expect(updated.updated_at).toBe("2026-08-25T00:01:00Z");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/schematics",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Pump station segment",
          nodes: [],
          links: [],
          measurements: [],
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/schematics/schematic-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          name: "Pump station segment",
          nodes: [],
          links: [],
          measurements: [],
        }),
      }),
    );
  });

  it("reopens and updates a draft without changing unfinished field values", async () => {
    let stored: Record<string, unknown> | null = null;
    const fetchMock = vi.fn().mockImplementation(async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST" || init?.method === "PUT") {
        stored = { ...JSON.parse(String(init.body)), id: "draft-1", created_at: "now", updated_at: "now" };
      }
      return jsonResponse(stored);
    });
    vi.stubGlobal("fetch", fetchMock);
    const draft = { name: "", nodes: [{ id: "node-1", label: "", type: "JUNCTION", x: 0, y: 0,
      input_params: { elevation: "", base_demand: "later" } }], links: [] };
    const created = await saveSchematic("engineer-a", draft);
    const reopened = await loadSchematic<typeof draft>("engineer-a", created.id);
    expect(reopened?.nodes[0].input_params).toEqual(draft.nodes[0].input_params);
    await saveSchematic("engineer-a", { ...created, name: "Working draft" });
    const updated = await loadSchematic<typeof draft>("engineer-a", created.id);
    expect(updated?.name).toBe("Working draft");
    expect(updated?.nodes[0].input_params).toEqual(draft.nodes[0].input_params);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(["POST", "GET", "PUT", "GET"]);
  });

  it("maps backend errors to SchematicApiError", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          detail: {
            error_code: "E400",
            message: "X-User-Id header is required until authentication is implemented.",
          },
        },
        { status: 401 },
      ),
    );

    await expect(listSchematics("")).rejects.toThrow(
      "X-User-Id header is required",
    );
  });

  it("returns null or false for missing schematics", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: { error_code: "E404" } }, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ detail: { error_code: "E404" } }, { status: 404 }));

    await expect(loadSchematic("engineer-a", "missing")).resolves.toBeNull();
    await expect(deleteSchematic("engineer-a", "missing")).resolves.toBe(false);
  });
});
