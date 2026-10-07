"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/session";

type AuditStatus = "SUCCESS" | "FAILED" | "NON_CONVERGENCE";
type AuditEntry = {
  id: string;
  timestamp: string;
  user_id: string;
  schematic_id?: string;
  network_size: number;
  status: AuditStatus;
  error_code?: string;
};
type AuditPage = { items: AuditEntry[]; total: number; page: number; pageSize: number };
type UserOption = { id: string; fullName: string; email: string };

export default function AuditLogView({ users }: { users: UserOption[] }) {
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (userId) params.set("userId", userId);
    if (status) params.set("status", status);
    apiFetch(`/api/v1/admin/audit-logs?${params}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail?.message ?? "Unable to load simulation history.");
        }
        return response.json() as Promise<AuditPage>;
      })
      .then(result => { if (!controller.signal.aborted) { setData(result); setError(""); setLoading(false); } })
      .catch(reason => { if (!controller.signal.aborted) { setData(null); setError(reason instanceof Error ? reason.message : "Unable to load simulation history."); setLoading(false); } });
    return () => controller.abort();
  }, [userId, status, page]);

  const userNames = new Map(users.map(user => [user.id, user.fullName]));
  return <section className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12" aria-label="Simulation history">
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-[#686868]">Simulation history</h1>
      <p className="mt-2 text-sm text-[#686b76]">Read-only record of simulation attempts. Network contents and results are not shown.</p>
      <div className="mt-7 flex flex-wrap gap-4">
        <label className="text-sm font-medium text-[#3a3d49]">User
          <select aria-label="Filter by user" value={userId} onChange={event => { setUserId(event.target.value); setPage(1); setLoading(true); }} className="mt-1 block min-h-10 rounded-lg border border-[#cdd1df] bg-white px-3 text-sm">
            <option value="">All users</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.fullName} ({user.email})</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-[#3a3d49]">Outcome
          <select aria-label="Filter by outcome" value={status} onChange={event => { setStatus(event.target.value); setPage(1); setLoading(true); }} className="mt-1 block min-h-10 rounded-lg border border-[#cdd1df] bg-white px-3 text-sm">
            <option value="">All outcomes</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
            <option value="NON_CONVERGENCE">Non-convergence</option>
          </select>
        </label>
      </div>
      {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {loading ? <p role="status" className="mt-8 text-sm text-[#686b76]">Loading simulation history…</p> : !data ? null : data.items.length === 0 ?
        <p className="mt-8 rounded-xl border border-dashed border-[#cdd1df] px-6 py-10 text-sm text-[#686b76]">No simulation attempts match these filters.</p> :
        <div className="mt-7 overflow-x-auto rounded-xl border border-[#d8dbe5]">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-[#eef1ff] text-[#3a3d49]"><tr><th scope="col" className="px-4 py-3">Time</th><th scope="col" className="px-4 py-3">User</th><th scope="col" className="px-4 py-3">Schematic</th><th scope="col" className="px-4 py-3">Elements</th><th scope="col" className="px-4 py-3">Outcome</th></tr></thead>
            <tbody className="divide-y divide-[#e1e3e9]">{data?.items.map(entry => <tr key={entry.id}>
              <td className="whitespace-nowrap px-4 py-3"><time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time></td>
              <td className="px-4 py-3"><span className="block font-medium">{userNames.get(entry.user_id) ?? "Unknown user"}</span><span className="block break-all text-xs text-[#686b76]">{entry.user_id}</span></td>
              <td className="break-all px-4 py-3 font-mono text-xs">{entry.schematic_id ?? "Inline network"}</td>
              <td className="px-4 py-3">{entry.network_size}</td>
              <td className="px-4 py-3">{entry.status === "NON_CONVERGENCE" ? "Non-convergence" : entry.status === "SUCCESS" ? "Success" : "Failed"}{entry.error_code && <span className="block font-mono text-xs text-[#686b76]">{entry.error_code}</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      {data && !loading && data.total > data.pageSize && <div className="mt-5 flex items-center gap-4 text-sm">
        <button type="button" disabled={page === 1} onClick={() => { setPage(page - 1); setLoading(true); }} className="rounded-full border border-[#9aa6eb] px-4 py-2 text-[#102ac6] disabled:opacity-40">Previous</button>
        <span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span>
        <button type="button" disabled={page * data.pageSize >= data.total} onClick={() => { setPage(page + 1); setLoading(true); }} className="rounded-full border border-[#9aa6eb] px-4 py-2 text-[#102ac6] disabled:opacity-40">Next</button>
      </div>}
    </div>
  </section>;
}
