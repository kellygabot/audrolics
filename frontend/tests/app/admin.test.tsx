import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminPage from "@/app/admin/page";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ apiFetch, useSession: () => ({ user: { id: "admin", fullName: "Admin", email: "admin@example.com", role: "ADMIN" }, logout: vi.fn().mockResolvedValue(undefined) }) }));
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
let users: Array<{ id: string; fullName: string; email: string; status: string; deletedAt: string | null }>;
let diagrams: Array<{ id: string; user_id: string; name: string; updated_at: string; deleted_at: string | null }>;
beforeEach(() => {
  users = [{ id: "alice", fullName: "Alice", email: "alice@example.com", status: "ACTIVE", deletedAt: null }];
  diagrams = [{ id: "d1", user_id: "alice", name: "Pump", updated_at: "2026-01-01T00:00:00Z", deleted_at: null }];
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/v1/admin/users" && !init?.method) return json(users);
    if (path === "/api/v1/admin/schematics" && !init?.method) return json(diagrams);
    if (path === "/api/v1/admin/users" && init?.method === "POST") {
      const values = JSON.parse(String(init.body));
      const person = { id: "new-user", fullName: values.fullName, email: values.email, status: "ACTIVE", deletedAt: null };
      users.unshift(person);
      return json(person);
    }
    if (path === "/api/v1/admin/users/alice" && init?.method === "DELETE") { const person = users.find(item => item.id === "alice")!; person.deletedAt = "2026-01-02T00:00:00Z"; return json(person); }
    if (path === "/api/v1/admin/users/alice" && init?.method === "PATCH") { const person = users.find(item => item.id === "alice")!; Object.assign(person, JSON.parse(String(init.body))); return json(person); }
    if (path === "/api/v1/admin/users/alice/restore") { const person = users.find(item => item.id === "alice")!; person.deletedAt = null; return json(person); }
    if (path === "/api/v1/admin/users/alice/status") { users[0].status = "SUSPENDED"; return json(users[0]); }
    if (path === "/api/v1/admin/schematics/d1" && init?.method === "DELETE") { diagrams[0].deleted_at = "2026-01-02T00:00:00Z"; return json(diagrams[0]); }
    if (path === "/api/v1/admin/schematics/d1/restore") { diagrams[0].deleted_at = null; return json(diagrams[0]); }
    return json({});
  });
});
afterEach(() => { cleanup(); apiFetch.mockReset(); vi.restoreAllMocks(); });

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

it("searches users and shows only the selected user's schematic metadata", async () => {
  users.push({ id: "bob", fullName: "Bob", email: "bob@example.com", status: "ACTIVE", deletedAt: null });
  diagrams.push({ id: "d2", user_id: "bob", name: "Bob's network", updated_at: "2026-01-03T00:00:00Z", deleted_at: null });
  render(<AdminPage />);
  expect(await screen.findByText("Pump")).toBeTruthy();
  fireEvent.change(screen.getByRole("searchbox", { name: /search users/i }), { target: { value: "bob" } });
  expect(screen.queryByRole("button", { name: "Alice" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Bob" }));
  expect(screen.getByText("Bob's network")).toBeTruthy();
  expect(screen.queryByText("Pump")).toBeNull();
});

it("creates a user from the right pane and switches to recently deleted accounts", async () => {
  render(<AdminPage />);
  await screen.findByText("Pump");
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Full name" }), { target: { value: "Chris" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "chris@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123" } });
  fireEvent.click(screen.getByRole("button", { name: "Save user" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Chris" })).toBeTruthy());
  expect(apiFetch).toHaveBeenCalledWith("/api/v1/admin/users", expect.objectContaining({ method: "POST" }));

  vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Alice" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Alice" })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Recently deleted" }));
  expect(screen.getByRole("button", { name: "Alice" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Alice" })).toBeNull());
  expect(apiFetch).toHaveBeenCalledWith("/api/v1/admin/users/alice/restore", expect.objectContaining({ method: "POST" }));
});

it("updates the selected user's name and email", async () => {
  render(<AdminPage />);
  await screen.findByText("Pump");
  fireEvent.click(screen.getByRole("button", { name: "Update" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Full name" }), { target: { value: "Alice Smith" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "alice.smith@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Save user" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Alice Smith" })).toBeTruthy());
  expect(apiFetch).toHaveBeenCalledWith("/api/v1/admin/users/alice", expect.objectContaining({ method: "PATCH" }));
});
