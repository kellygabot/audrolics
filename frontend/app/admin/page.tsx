"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, useSession } from "@/lib/session";

type ManagedUser = { _id: string; name: string; email: string; status: "ACTIVE" | "SUSPENDED"; deletedAt: string | null };
type Diagram = { id: string; user_id: string; name: string; updated_at: string; deleted_at: string | null };
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.detail?.message ?? "Request failed."); }
  return response.json() as Promise<T>;
}
export default function AdminPage() {
  const { user, logout } = useSession(); const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>([]); const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [editing, setEditing] = useState<string | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => { const [people, items] = await Promise.all([request<ManagedUser[]>("/api/v1/admin/users"), request<Diagram[]>("/api/v1/admin/schematics")]); setUsers(people); setDiagrams(items); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void reload().catch(e => setError(e.message)); }, 0); return () => window.clearTimeout(timer); }, [reload]);
  async function perform(action: () => Promise<unknown>) { setBusy(true); setError(""); try { await action(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); } finally { setBusy(false); } }
  function beginEdit(person: ManagedUser) { setEditing(person._id); setName(person.name); setEmail(person.email); setPassword(""); }
  async function save(event: React.FormEvent) { event.preventDefault(); await perform(async () => { await request(`/api/v1/admin/users${editing ? `/${editing}` : ""}`, { method: editing ? "PATCH" : "POST", body: JSON.stringify(editing ? { name, email } : { name, email, password }) }); setEditing(null); setName(""); setEmail(""); setPassword(""); }); }
  const changeUser = (id: string, operation: "status" | "delete" | "restore", value?: string) => perform(() => request(`/api/v1/admin/users/${id}${operation === "status" ? "/status" : operation === "restore" ? "/restore" : ""}`, { method: operation === "status" ? "PATCH" : operation === "delete" ? "DELETE" : "POST", ...(value ? { body: JSON.stringify({ status: value }) } : {}) }));
  const changeDiagram = (id: string, restore: boolean) => perform(() => request(`/api/v1/admin/schematics/${id}${restore ? "/restore" : ""}`, { method: restore ? "POST" : "DELETE" }));
  return <main className="min-h-screen bg-slate-50 p-6 text-slate-900"><div className="mx-auto max-w-6xl space-y-8">
    <header className="flex items-center justify-between gap-4"><div><h1 className="text-3xl font-bold">Administration</h1><p>{user?.name} · {user?.email}</p></div><button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={() => void logout().then(() => router.replace("/"))}>Log out</button></header>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
    <section className="rounded-xl bg-white p-5 shadow"><h2 className="mb-4 text-xl font-semibold">{editing ? "Edit user" : "Create user"}</h2><form onSubmit={e => void save(e)} className="flex flex-wrap gap-3"><input aria-label="Name" className="rounded border p-2" placeholder="Name" required value={name} onChange={e => setName(e.target.value)} /><input aria-label="Email" type="email" className="rounded border p-2" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)} />{!editing && <input aria-label="Password" type="password" minLength={8} className="rounded border p-2" placeholder="Password" required value={password} onChange={e => setPassword(e.target.value)} />}<button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-white">Save</button>{editing && <button type="button" onClick={() => { setEditing(null); setName(""); setEmail(""); }}>Cancel</button>}</form><p className="mt-2 text-sm text-slate-500">Share newly created passwords with users outside the app.</p></section>
    <section className="rounded-xl bg-white p-5 shadow"><h2 className="mb-4 text-xl font-semibold">Users</h2><div className="space-y-3">{users.map(person => <div key={person._id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"><div><strong>{person.name}</strong><div className="text-sm">{person.email} · {person.deletedAt ? "Deleted" : person.status}</div></div><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => beginEdit(person)}>Edit</button>{person.deletedAt ? <button disabled={busy} onClick={() => void changeUser(person._id, "restore")}>Restore</button> : <><button disabled={busy} onClick={() => void changeUser(person._id, "status", person.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")}>{person.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button><button disabled={busy} className="text-red-700" onClick={() => { if (confirm(`Delete ${person.email}?`)) void changeUser(person._id, "delete"); }}>Delete</button></>}</div></div>)}</div></section>
    <section className="rounded-xl bg-white p-5 shadow"><h2 className="mb-4 text-xl font-semibold">Schematic metadata</h2><div className="space-y-3">{diagrams.map(diagram => <div key={diagram.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"><div><strong>{diagram.name || "Untitled"}</strong><div className="text-sm text-slate-500">Owner: {users.find(person => person._id === diagram.user_id)?.email ?? diagram.user_id} · Updated: {new Date(diagram.updated_at).toLocaleDateString()} · {diagram.deleted_at ? "Deleted" : "Active"}</div></div><button disabled={busy} onClick={() => void changeDiagram(diagram.id, !!diagram.deleted_at)}>{diagram.deleted_at ? "Restore" : "Delete"}</button></div>)}</div></section>
  </div></main>;
}
