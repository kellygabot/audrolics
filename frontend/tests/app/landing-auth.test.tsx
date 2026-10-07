import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Home from "@/app/page";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const session = vi.hoisted(() => ({ user: null as null | { role: "USER" | "ADMIN"; fullName: string; email: string }, ready: true }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/session", () => ({ useSession: () => ({ ...session, logout: vi.fn().mockResolvedValue(undefined), accept: vi.fn() }) }));
afterEach(() => { cleanup(); router.push.mockReset(); session.user = null; });
it("opens login from Create Now for visitors", () => { render(<Home />); fireEvent.click(screen.getByRole("button", { name: /create now/i })); expect(screen.getByText("Welcome back")).toBeTruthy(); });
it("routes signed-in users and admins to their own destination", () => { session.user = { role: "USER", fullName: "Alice", email: "alice@example.com" }; const view = render(<Home />); fireEvent.click(screen.getByRole("button", { name: /create now/i })); expect(router.push).toHaveBeenCalledWith("/schematics"); view.unmount(); session.user = { role: "ADMIN", fullName: "Admin", email: "admin@example.com" }; render(<Home />); fireEvent.click(screen.getByRole("button", { name: /create now/i })); expect(router.push).toHaveBeenCalledWith("/admin"); });

it("shows the same account card on the landing page", () => {
  session.user = { role: "ADMIN", fullName: "Site Admin", email: "admin@example.com" };
  render(<Home />);
  fireEvent.click(screen.getByRole("button", { name: "Site Admin" }));
  const card = screen.getByRole("dialog", { name: "Account details" });
  expect(card.textContent).toContain("admin@example.com");
  expect(card.textContent).toContain("Admin");
  expect(card.textContent).not.toMatch(/linkedin|phone/i);
});

it("routes a successful login using the returned account role", async () => {
  const { default: AuthModal } = await import("@/components/auth/page");
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "t", user: { id: "admin", fullName: "Admin", email: "admin@example.com", role: "ADMIN" } }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  render(<AuthModal mode="login" onClose={vi.fn()} onSwitchMode={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText("you@company.com"), { target: { value: "admin@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("Enter your password"), { target: { value: "Password123!" } });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin"));
  vi.unstubAllGlobals();
});

it("links the draft policies and sends the required signup acknowledgment", async () => {
  const { default: AuthModal } = await import("@/components/auth/page");
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "t", user: { id: "alice", fullName: "Alice", email: "alice@example.com", role: "USER" } }), { status: 201, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  render(<AuthModal mode="signup" onClose={vi.fn()} onSwitchMode={vi.fn()} />);
  expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
  expect(screen.getByRole("link", { name: "Privacy notice" }).getAttribute("href")).toBe("/privacy");
  fireEvent.change(screen.getByPlaceholderText("Juan Dela Cruz"), { target: { value: "Alice" } });
  fireEvent.change(screen.getByPlaceholderText("you@company.com"), { target: { value: "alice@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), { target: { value: "Password123!" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/register", expect.objectContaining({ body: JSON.stringify({ email: "alice@example.com", password: "Password123!", fullName: "Alice", acceptedPolicies: true }) })));
  vi.unstubAllGlobals();
});
