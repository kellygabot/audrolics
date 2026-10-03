import { describe, expect, it } from "vitest";
import {
  fitInlineSymbolScale,
  linkEndpoints,
  nodeBoundaryPoint,
} from "@/lib/builder-canvas-geometry";

describe("builder canvas geometry", () => {
  it("stops a horizontal link at the visible junction and tank outlines", () => {
    const segment = linkEndpoints(
      { type: "JUNCTION", x: 0, y: 0 },
      { type: "TANK", x: 100, y: 0 },
      1,
    );
    expect(segment.start).toEqual({ x: 16, y: 0 });
    expect(segment.end).toEqual({ x: 80, y: 0 });
    expect(segment.length).toBe(64);
  });

  it("uses the reservoir triangle edge for vertical and diagonal links", () => {
    const reservoir = { type: "RESERVOIR" as const, x: 0, y: 0 };
    expect(nodeBoundaryPoint(reservoir, { x: 0, y: 100 }, 1).y).toBeCloseTo(12);
    const diagonal = nodeBoundaryPoint(reservoir, { x: 100, y: -100 }, 1);
    expect(diagonal.x).toBeGreaterThan(0);
    expect(diagonal.y).toBeLessThan(0);
    expect(diagonal.x).toBeLessThan(18);
  });

  it("shrinks inline symbols on short links without changing requested size", () => {
    expect(fitInlineSymbolScale(100, 1.5, 56)).toBe(1.5);
    expect(fitInlineSymbolScale(20, 1.5, 56)).toBeCloseTo(16 / 56);
    expect(fitInlineSymbolScale(4, 1.5, 56)).toBe(0);
  });

  it("never returns a backwards visible segment when node artwork overlaps", () => {
    const segment = linkEndpoints(
      { type: "JUNCTION", x: 0, y: 0 },
      { type: "JUNCTION", x: 10, y: 0 },
      1,
    );
    expect(segment.length).toBe(0);
    expect(segment.start).toEqual(segment.end);
  });
});
