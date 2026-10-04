import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { SessionProvider, Protected, apiFetch, useSession } from "@/lib/session";

const user = { id: "alice", name: "Alice", email: "alice@example.com", role: "USER", status: "ACTIVE" };
const admin = { ...user, id: "admin", role: "ADMIN" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function Controls() { const { user: active, ready, accept, logout } = useSession(); return <div><span>{ready ? active?.email ?? "signed-out" : "loading"}</span><button onClick={() => accept({ token: "alice-token", user: user as never })}>Alice</button><button onClick={() => accept({ token: "admin-token", user: admin as never })}>Admin</button><button onClick={() => accept({ token: "bob-token", user: { ...user, id: "bob", email: "bob@example.com" } as never })}>Bob</button><button onClick={() => void logout()}>Logout</button></div>; }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("refreshes on startup, sends Bearer auth, switches accounts, and clears logout", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ token: "old-token", user }));
  vi.stubGlobal("fetch", fetchMock);
  render(<SessionProvider><Controls /></SessionProvider>);
  expect(await screen.findByText("alice@example.com")).toBeTruthy();
  fetchMock.mockResolvedValueOnce(json({ ok: true }));
  await apiFetch("/api/v1/schematics");
  expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/schematics", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer old-token" }) }));
  fireEvent.click(screen.getByRole("button", { name: "Admin" }));
  fetchMock.mockResolvedValueOnce(json({ ok: true }));
  await apiFetch("/api/v1/admin/users");
  expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/admin/users", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer admin-token" }) }));
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
  fireEvent.click(screen.getByRole("button", { name: "Logout" }));
  await waitFor(() => expect(screen.getByText("signed-out")).toBeTruthy());
  expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/auth/logout", expect.objectContaining({ headers: { Authorization: "Bearer admin-token" } }));
});

it("holds protected content until an active USER session is loaded and remounts on account switch", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ token: "user-token", user }));
  vi.stubGlobal("fetch", fetchMock);
  function Private() { const { user: account } = useSession(); const [draft, setDraft] = useState(""); return <div><span>{account?.email}</span><input aria-label="Draft" value={draft} onChange={event => setDraft(event.target.value)} /></div>; }
  render(<SessionProvider><Controls /><Protected role="USER"><Private /></Protected></SessionProvider>);
  expect((await screen.findAllByText("alice@example.com")).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByRole("textbox", { name: "Draft" }), { target: { value: "Alice private draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Bob" }));
  expect(screen.getAllByText("bob@example.com").length).toBeGreaterThan(0);
  expect((screen.getByRole("textbox", { name: "Draft" }) as HTMLInputElement).value).toBe("");
});

it("does not retry an old account's request after refresh switches accounts", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ token: "alice-token", user }));
  vi.stubGlobal("fetch", fetchMock);
  render(<SessionProvider><Controls /></SessionProvider>);
  expect(await screen.findByText("alice@example.com")).toBeTruthy();
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(json({ token: "bob-token", user: { ...user, id: "bob", email: "bob@example.com" } }));
  await expect(apiFetch("/api/v1/schematics", { method: "POST", body: "private-draft" })).rejects.toThrow("Account changed");
  expect(fetchMock.mock.calls.filter(([path]) => path === "/api/v1/schematics")).toHaveLength(1);
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
  fireEvent.click(screen.getByRole("button", { name: "Logout" }));
});

it("does not render protected content without a valid session", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  render(<SessionProvider><Controls /><Protected role="USER"><p>Private schematics</p></Protected></SessionProvider>);
  expect(await screen.findByText("signed-out")).toBeTruthy();
  expect(screen.queryByText("Private schematics")).toBeNull();
});
