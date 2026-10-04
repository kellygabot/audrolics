"use client";
import { Fragment, createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type Account = { id: string; name: string; email: string; role: "USER" | "ADMIN"; status: "ACTIVE" | "SUSPENDED" };
type AuthResponse = { token: string; user: Account };
let accessToken: string | null = null;
let activeUser: Account | null = null;
let refreshPromise: Promise<AuthResponse | null> | null = null;
let sessionRevision = 0;
const context = createContext<{ user: Account | null; ready: boolean; accept: (data: AuthResponse) => void; logout: () => Promise<void> } | null>(null);
export const currentAccount = () => activeUser;
export const currentAccountId = () => activeUser?.id ?? "";
const setSession = (data: AuthResponse | null) => { sessionRevision++; accessToken = data?.token ?? null; activeUser = data?.user ?? null; window.dispatchEvent(new Event("audrolics-session")); };
const refreshSession = () => {
  const revision = sessionRevision;
  if (!refreshPromise) refreshPromise = fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then(async response => response.ok ? await response.json() as AuthResponse : null)
    .catch(() => null).then(data => { if (sessionRevision === revision) setSession(data); return data; }).finally(() => { refreshPromise = null; });
  return refreshPromise;
};
export async function apiFetch(path: string, init: RequestInit = {}) {
  if (!accessToken) { await refreshSession(); if (!accessToken) throw new Error("Session expired. Please log in."); }
  const send = () => fetch(path, { ...init, credentials: "same-origin", headers: { ...init.headers, Authorization: `Bearer ${accessToken}` } });
  const originalAccountId = activeUser?.id;
  let response = await send();
  if (response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed && activeUser?.id !== originalAccountId) throw new Error("Account changed. Please reopen the page before saving.");
    if (refreshed) response = await send();
  }
  if (response.status === 401) setSession(null);
  return response;
}
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(activeUser);
  const [ready, setReady] = useState(false);
  useEffect(() => { const sync = () => setUser(activeUser); window.addEventListener("audrolics-session", sync); void refreshSession().finally(() => setReady(true)); return () => window.removeEventListener("audrolics-session", sync); }, []);
  const accept = (data: AuthResponse) => { setSession(data); setReady(true); };
  const logout = async () => { const token = accessToken; setSession(null); await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin", headers: token ? { Authorization: `Bearer ${token}` } : {} }); };
  return <context.Provider value={{ user, ready, accept, logout }}>{children}</context.Provider>;
}
export function useSession() { const value = useContext(context); if (!value) throw new Error("SessionProvider missing"); return value; }
export function Protected({ role, children }: { role: "USER" | "ADMIN"; children: ReactNode }) {
  const { user, ready } = useSession(); const router = useRouter();
  useEffect(() => { if (ready && user?.role !== role) router.replace(user?.role === "ADMIN" ? "/admin" : user ? "/schematics" : "/?login=1"); }, [ready, user, role, router]);
  if (!ready || user?.role !== role) return <main className="p-8">Loading account…</main>;
  return <Fragment key={user.id}>{children}</Fragment>;
}
