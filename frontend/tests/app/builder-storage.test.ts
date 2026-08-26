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
      expect.objectContaining({
        headers: expect.objectContaining({ "X-User-Id": "engineer-a" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/schematics/schematic-1",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-User-Id": "engineer-a" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/schematics/schematic-1",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "X-User-Id": "engineer-a" }),
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
