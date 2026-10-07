"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import AccountMenu from "@/components/account-menu";
import { apiFetch } from "@/lib/session";
import AuditLogView from "./audit-log-view";

type ManagedUser = { id: string; fullName: string; email: string; status: "ACTIVE" | "SUSPENDED"; deletedAt: string | null };
type Diagram = { id: string; user_id: string; name: string; updated_at: string; deleted_at: string | null };
type FormMode = "view" | "create" | "edit";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail?.message ?? "Request failed.");
  }
  return response.json() as Promise<T>;
}

function ActionIcon({ kind }: { kind: "create" | "update" | "delete" }) {
  if (kind === "create") return <span aria-hidden="true" className="text-xl leading-none">+</span>;
  if (kind === "delete") return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M3.5 5.5h13M7 5.5V3.7h6v1.8m-8.5 0 .8 11h9.4l.8-11M8 8.5v5m4-5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M16.5 9a6.5 6.5 0 1 1-2-4.7M16.5 3.5v4.2h-4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function AdminPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [mode, setMode] = useState<FormMode>("view");
  const [query, setQuery] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"users" | "audit">("users");

  const reload = useCallback(async (deletedView = false) => {
    const [people, items] = await Promise.all([
      request<ManagedUser[]>("/api/v1/admin/users"),
      request<Diagram[]>("/api/v1/admin/schematics"),
    ]);
    setUsers(people);
    setDiagrams(items);
    setSelectedId(current => people.some(person => person.id === current && Boolean(person.deletedAt) === deletedView)
      ? current : people.find(person => Boolean(person.deletedAt) === deletedView)?.id ?? null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload().catch(e => setError(e instanceof Error ? e.message : "Unable to load admin data.")).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try { await action(); await reload(showDeleted); }
    catch (e) { setError(e instanceof Error ? e.message : "Request failed."); }
    finally { setBusy(false); }
  }

  const selected = users.find(person => person.id === selectedId && Boolean(person.deletedAt) === showDeleted) ?? null;
  const visibleUsers = users.filter(person => Boolean(person.deletedAt) === showDeleted &&
    [person.fullName, person.email, person.id].some(value => value.toLowerCase().includes(query.trim().toLowerCase())));
  const selectedDiagrams = selected ? diagrams.filter(diagram => diagram.user_id === selected.id) : [];

  function beginCreate() { setMode("create"); setFullName(""); setEmail(""); setPassword(""); setError(""); }
  function beginEdit() {
    if (!selected) return;
    setMode("edit"); setFullName(selected.fullName); setEmail(selected.email); setPassword(""); setError("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      const created = await request<ManagedUser>(`/api/v1/admin/users${mode === "edit" ? `/${selectedId}` : ""}`, {
        method: mode === "edit" ? "PATCH" : "POST",
        body: JSON.stringify(mode === "edit" ? { fullName, email } : { fullName, email, password }),
      });
      if (created?.id) setSelectedId(created.id);
      setMode("view"); setFullName(""); setEmail(""); setPassword(""); setShowDeleted(false);
    });
  }
  const changeUser = (id: string, operation: "status" | "delete" | "restore", value?: string) => perform(() =>
    request(`/api/v1/admin/users/${id}${operation === "status" ? "/status" : operation === "restore" ? "/restore" : ""}`, {
      method: operation === "status" ? "PATCH" : operation === "delete" ? "DELETE" : "POST",
      ...(value ? { body: JSON.stringify({ status: value }) } : {}),
    }));
  const changeDiagram = (id: string, restore: boolean) => perform(() =>
    request(`/api/v1/admin/schematics/${id}${restore ? "/restore" : ""}`, { method: restore ? "POST" : "DELETE" }));
  function toggleDeleted() {
    const next = !showDeleted;
    setShowDeleted(next);
    setSelectedId(users.find(person => Boolean(person.deletedAt) === next)?.id ?? null);
    setMode("view"); setQuery("");
  }

  return <main className="min-h-dvh bg-white text-[#30323b]">
    <header className="relative z-30 flex min-h-22 items-center gap-5 border-b border-[#d8d8dc] bg-white px-5 py-3 sm:px-8 lg:gap-10">
      <Link href="/" className="flex shrink-0 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#021eef]">
        <Image src="/logo.svg" alt="" width={34} height={34} className="h-8 w-8" />
        <span className="hidden text-lg font-medium text-[#4d4d50] sm:inline">Audrolics</span>
      </Link>
      {view === "users" && <div className="relative mx-auto w-full max-w-3xl">
        <label htmlFor="admin-user-search" className="sr-only">Search users by name, email, or ID</label>
        <input id="admin-user-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search user by ID or name" className="h-12 w-full rounded-full bg-[#eef1ff] py-2 pl-5 pr-12 text-sm text-[#30323b] placeholder:text-[#696d7c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#021eef] sm:pl-7 sm:text-base" />
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute right-4 top-1/2 h-6 w-6 -translate-y-1/2 text-[#929ff3]"><circle cx="10.8" cy="10.8" r="6.5" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </div>}
      <nav aria-label="Admin sections" className="ml-auto flex shrink-0 gap-2 text-xs font-semibold sm:text-sm">
        <button type="button" aria-current={view === "users" ? "page" : undefined} onClick={() => setView("users")} className={`rounded-full px-3 py-2 ${view === "users" ? "bg-[#0924dd] text-white" : "text-[#102ac6] hover:bg-[#eef1ff]"}`}>Users</button>
        <button type="button" aria-current={view === "audit" ? "page" : undefined} onClick={() => setView("audit")} className={`rounded-full px-3 py-2 ${view === "audit" ? "bg-[#0924dd] text-white" : "text-[#102ac6] hover:bg-[#eef1ff]"}`}>Simulation history</button>
      </nav>
      <AccountMenu appearance="outline" />
    </header>
    {error && <div role="alert" className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-800">{error}</div>}
    {view === "audit" ? <AuditLogView users={users} /> : <div className="grid min-h-[calc(100dvh-5.5rem)] lg:h-[calc(100dvh-5.5rem)] lg:grid-cols-[minmax(300px,31%)_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="flex min-h-[24rem] flex-col border-b border-[#d8d8dc] lg:min-h-0 lg:border-b-0 lg:border-r" aria-label="User management">
        <div className="flex flex-wrap gap-2 border-b border-[#d8d8dc] px-5 py-4 sm:px-7">
          <button type="button" disabled={busy || showDeleted} onClick={beginCreate} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#05bf6b] px-4 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-[#009f58] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#05bf6b] disabled:cursor-not-allowed disabled:bg-[#e7e7e7] disabled:text-[#858585]"><ActionIcon kind="create" />Create</button>
          <button type="button" disabled={busy || !selected || showDeleted} onClick={beginEdit} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#0924dd] px-4 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-[#061ab0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0924dd] disabled:cursor-not-allowed disabled:bg-[#e7e7e7] disabled:text-[#858585]"><ActionIcon kind="update" />Update</button>
          <button type="button" disabled={busy || !selected} onClick={() => {
            if (!selected) return;
            if (showDeleted) { void changeUser(selected.id, "restore"); return; }
            if (window.confirm(`Delete ${selected.email}?`)) void changeUser(selected.id, "delete");
          }} className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-xs font-bold uppercase tracking-wide text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-[#e7e7e7] disabled:text-[#858585] ${showDeleted ? "bg-[#0924dd] hover:bg-[#061ab0] focus-visible:outline-[#0924dd]" : "bg-[#f2232d] hover:bg-[#cf1721] focus-visible:outline-[#f2232d]"}`}><ActionIcon kind={showDeleted ? "update" : "delete"} />{showDeleted ? "Restore" : "Delete"}</button>
        </div>
        <div className="min-h-0 flex-1 px-5 py-7 sm:px-7 lg:overflow-y-auto">
          <h1 className="mb-5 text-2xl font-semibold text-[#747474]">{showDeleted ? "Recently deleted" : "Users"}</h1>
          {loading ? <p className="text-sm text-[#686b76]" role="status">Loading users…</p> : visibleUsers.length === 0 ? (
            <p className="text-sm text-[#686b76]">{query ? "No users match your search." : showDeleted ? "No deleted users." : "No users yet. Create one to get started."}</p>
          ) : <ul className="space-y-1">{visibleUsers.map(person => {
            const active = person.id === selected?.id;
            return <li key={person.id}>
              <button type="button" aria-current={active ? "true" : undefined} onClick={() => { setSelectedId(person.id); setMode("view"); }} className={`w-full rounded-lg px-3 py-2 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#021eef] ${active ? "bg-[#eaedff] font-semibold text-[#2d3250]" : "text-[#5d606b] hover:bg-[#f2f3f8]"}`}><span aria-hidden="true" className="mr-2 text-[#5366df]">{active ? "⌄" : "›"}</span>{person.fullName}</button>
              {active && <div className="ml-1 rounded-r-xl border-l-4 border-[#1835ef] bg-[#eaedff] px-5 py-4 text-sm text-[#33384b]">
                <dl className="space-y-2">
                  <div><dt className="text-xs font-medium text-[#626981]">Email</dt><dd className="break-all font-medium">{person.email}</dd></div>
                  <div><dt className="text-xs font-medium text-[#626981]">Status</dt><dd className="font-medium">{person.deletedAt ? "Deleted" : person.status === "ACTIVE" ? "Active" : "Suspended"}</dd></div>
                  <div><dt className="text-xs font-medium text-[#626981]">ID</dt><dd className="break-all font-mono text-xs">{person.id}</dd></div>
                </dl>
                {!person.deletedAt && <button type="button" disabled={busy} onClick={() => void changeUser(person.id, "status", person.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")} className="mt-4 rounded-full border border-[#9aa6eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#102ac6] hover:bg-[#f6f7ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#021eef] disabled:opacity-50">{person.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button>}
              </div>}
            </li>;
          })}</ul>}
        </div>
        <div className="border-t border-[#d8d8dc] px-5 py-4 sm:px-7"><button type="button" onClick={toggleDeleted} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-xs font-bold uppercase tracking-wide transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#021eef] ${showDeleted ? "border border-[#1531e8] bg-white text-[#1531e8] hover:bg-[#f1f3ff]" : "bg-[#0924dd] text-white hover:bg-[#061ab0]"}`}>{showDeleted ? <ActionIcon kind="update" /> : <Image src="/reload.svg" alt="" width={20} height={18} aria-hidden="true" />}{showDeleted ? "Back to users" : "Recently deleted"}</button></div>
      </aside>
      <section className="min-w-0 px-6 py-8 sm:px-10 lg:overflow-y-auto lg:px-12 lg:py-10" aria-label="User details">
        {mode !== "view" ? <div className="max-w-xl">
          <div className="mb-8 flex items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold text-[#686868]">{mode === "create" ? "Create user" : "Update user"}</h2><p className="mt-2 text-sm text-[#686b76]">{mode === "create" ? "Add a regular user account." : `Edit ${selected?.fullName ?? "this account"}.`}</p></div><button type="button" onClick={() => setMode("view")} className="text-sm font-medium text-[#102ac6] underline-offset-4 hover:underline">Cancel</button></div>
          <form onSubmit={event => void save(event)} className="space-y-5">
            <label className="block text-sm font-medium text-[#3a3d49]">Full name<input aria-label="Full name" required maxLength={120} value={fullName} onChange={event => setFullName(event.target.value)} className="mt-2 block h-11 w-full rounded-lg border border-[#cdd1df] bg-white px-3 text-[#30323b] focus-visible:outline-2 focus-visible:outline-[#021eef]" /></label>
            <label className="block text-sm font-medium text-[#3a3d49]">Email<input aria-label="Email" type="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-2 block h-11 w-full rounded-lg border border-[#cdd1df] bg-white px-3 text-[#30323b] focus-visible:outline-2 focus-visible:outline-[#021eef]" /></label>
            {mode === "create" && <label className="block text-sm font-medium text-[#3a3d49]">Password<input aria-label="Password" type="password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 block h-11 w-full rounded-lg border border-[#cdd1df] bg-white px-3 text-[#30323b] focus-visible:outline-2 focus-visible:outline-[#021eef]" /></label>}
            {mode === "create" && <p className="text-sm text-[#626981]">Share the new password with the user outside the app.</p>}
            <button type="submit" disabled={busy} className="rounded-full bg-[#0924dd] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#061ab0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#021eef] disabled:opacity-50">{busy ? "Saving…" : "Save user"}</button>
          </form>
        </div> : selected ? <>
          <div className="mb-8"><h2 className="text-2xl font-semibold text-[#686868]">Schematic diagrams</h2><p className="mt-2 text-sm text-[#686b76]">{selected.fullName} · {selected.email}</p></div>
          {selectedDiagrams.length === 0 ? <div className="rounded-xl border border-dashed border-[#cdd1df] px-6 py-10 text-sm text-[#686b76]">No schematic diagrams for this user.</div> : <ul className="divide-y divide-[#e1e3e9] border-y border-[#e1e3e9]">{selectedDiagrams.map(diagram => <li key={diagram.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="min-w-0"><h3 className="truncate text-lg font-semibold text-[#5b5b5b]">{diagram.name || "Untitled schematic"}</h3><p className="mt-1 text-xs text-[#666b7b]">Updated {new Date(diagram.updated_at).toLocaleDateString()} · {diagram.deleted_at ? "Deleted" : "Active"}</p></div>
            <button type="button" disabled={busy} onClick={() => void changeDiagram(diagram.id, Boolean(diagram.deleted_at))} className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${diagram.deleted_at ? "border-[#0924dd] text-[#0924dd] hover:bg-[#eef1ff] focus-visible:outline-[#0924dd]" : "border-[#d72a35] text-[#c31b28] hover:bg-red-50 focus-visible:outline-[#d72a35]"}`}>{diagram.deleted_at ? "Restore" : "Delete"}</button>
          </li>)}</ul>}
        </> : <div className="flex min-h-[15rem] items-center justify-center rounded-xl border border-dashed border-[#d8dbe5] text-center text-sm text-[#686b76]">Select a user to view their schematic diagrams.</div>}
      </section>
    </div>}
  </main>;
}
