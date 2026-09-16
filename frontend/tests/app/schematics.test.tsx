import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SchematicsPage } from "@/app/schematics/page";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const mockSchematics = [
  { id: "s1", name: "Alpha Network", updated_at: "2024-01-15T10:00:00Z" },
  { id: "s2", name: "Beta Loop", updated_at: "2024-01-16T11:00:00Z" },
  { id: "s3", name: "Gamma Branch", updated_at: "2024-01-17T12:00:00Z" },
];

describe("SchematicsPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(mockSchematics)));
  });

  it("filters list in real time, case-insensitive, substring match", async () => {
    render(<SchematicsPage />);

    await screen.findByText("Alpha Network");

    const searchInput = screen.getByRole("searchbox", { name: /search schematics/i });

    fireEvent.change(searchInput, { target: { value: "alpha" } });
    expect(screen.getByText("Alpha Network")).toBeInTheDocument();
    expect(screen.queryByText("Beta Loop")).not.toBeInTheDocument();
    expect(screen.queryByText("Gamma Branch")).not.toBeInTheDocument();
  });

  it("clearing the search restores the full list", async () => {
    render(<SchematicsPage />);

    await screen.findByText("Alpha Network");

    const searchInput = screen.getByRole("searchbox", { name: /search schematics/i });

    fireEvent.change(searchInput, { target: { value: "alpha" } });
    expect(screen.queryByText("Beta Loop")).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByText("Alpha Network")).toBeInTheDocument();
    expect(screen.getByText("Beta Loop")).toBeInTheDocument();
    expect(screen.getByText("Gamma Branch")).toBeInTheDocument();
  });

  it("search matches substrings case-insensitively", async () => {
    render(<SchematicsPage />);

    await screen.findByText("Alpha Network");

    const searchInput = screen.getByRole("searchbox", { name: /search schematics/i });

    fireEvent.change(searchInput, { target: { value: "NET" } });
    expect(screen.getByText("Alpha Network")).toBeInTheDocument();
    expect(screen.queryByText("Beta Loop")).not.toBeInTheDocument();
  });

  it("shows no-results state (not empty state) when query matches nothing", async () => {
    render(<SchematicsPage />);

    await screen.findByText("Alpha Network");

    const searchInput = screen.getByRole("searchbox", { name: /search schematics/i });
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });

    expect(screen.getByText(/no schematics match/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear search/i })).toBeInTheDocument();
    expect(screen.queryByText("No schematics yet")).not.toBeInTheDocument();
  });

  it("shows genuine empty state when no items and no query", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    render(<SchematicsPage />);

    await screen.findByText("No schematics yet");
    expect(screen.getByText("No schematics yet")).toBeInTheDocument();
  });

  it("New Schematic button is in the body, not the header", async () => {
    render(<SchematicsPage />);

    await screen.findByText("Alpha Network");

    const newBtn = screen.getAllByRole("button", { name: /new schematic/i });
    expect(newBtn.length).toBeGreaterThanOrEqual(1);

    const header = document.querySelector("header")!;
    const headerButtons = Array.from(header.querySelectorAll("button"));
    const headerNewSchematic = headerButtons.filter((btn) =>
      /new schematic/i.test(btn.textContent ?? ""),
    );
    expect(headerNewSchematic).toHaveLength(0);
  });

  it("profile chip reveals placeholder email and role", async () => {
    render(<SchematicsPage />);

    await screen.findByText("Alpha Network");

    const chip = screen.getByRole("button", { name: /engineer@audrolics\.dev/i });
    fireEvent.click(chip);

    const dialog = await screen.findByRole("dialog");
    const content = within(dialog);
    expect(content.getByText("Your profile")).toBeInTheDocument();
    expect(content.getAllByText("engineer@audrolics.dev").length).toBeGreaterThanOrEqual(1);
    expect(content.getByText("ENGINEER")).toBeInTheDocument();
    expect(content.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("Sign out closes popover (placeholder router.replace call)", async () => {
    render(<SchematicsPage />);

    await screen.findByText("Alpha Network");

    const chip = screen.getByRole("button", { name: /engineer@audrolics\.dev/i });
    fireEvent.click(chip);

    // Dialog opens
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Sign out button is inside
    fireEvent.click(within(dialog).getByRole("button", { name: /sign out/i }));

    // Dialog closes
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});