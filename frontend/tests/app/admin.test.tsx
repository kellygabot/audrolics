import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminPage from "@/app/admin/page";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ apiFetch, useSession: () => ({ user: { id: "admin", name: "Admin", email: "admin@example.com", role: "ADMIN" }, logout: vi.fn().mockResolvedValue(undefined) }) }));
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
let users: Array<{ _id: string; name: string; email: string; status: string; deletedAt: string | null }>;
let diagrams: Array<{ id: string; user_id: string; name: string; updated_at: string; deleted_at: string | null }>;
beforeEach(() => {
  users = [{ _id: "alice", name: "Alice", email: "alice@example.com", status: "ACTIVE", deletedAt: null }];
  diagrams = [{ id: "d1", user_id: "alice", name: "Pump", updated_at: "2026-01-01T00:00:00Z", deleted_at: null }];
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/v1/admin/users" && !init?.method) return json(users);
    if (path === "/api/v1/admin/schematics" && !init?.method) return json(diagrams);
    if (path === "/api/v1/admin/users/alice/status") { users[0].status = "SUSPENDED"; return json(users[0]); }
    if (path === "/api/v1/admin/schematics/d1" && init?.method === "DELETE") { diagrams[0].deleted_at = "2026-01-02T00:00:00Z"; return json(diagrams[0]); }
    if (path === "/api/v1/admin/schematics/d1/restore") { diagrams[0].deleted_at = null; return json(diagrams[0]); }
    return json({});
  });
});
afterEach(() => { cleanup(); apiFetch.mockReset(); });

it("suspends a user and soft-deletes then restores schematic metadata", async () => {
  render(<AdminPage />);
  expect(await screen.findByText("Alice")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Reactivate" })).toBeTruthy());
  fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);
  await waitFor(() => expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Delete" }).length).toBeGreaterThan(0));
  expect(apiFetch).toHaveBeenCalledWith("/api/v1/admin/schematics/d1/restore", expect.objectContaining({ method: "POST" }));
});
