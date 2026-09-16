"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/modal/page";
import {
  deleteSchematic,
  listSchematics,
  formatSchematicError,
  type StoredSchematicSummary,
} from "../../lib/builder-storage";

const DEV_USER_ID = "dev-user";

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString();
  } catch {
    return iso;
  }
}

export function SchematicsPage() {
  // Placeholder user – replace with real auth once implemented.
  // TODO(auth): wire this to the real session/user once authentication lands.
  // This page is the only in-scope surface for now.
  const PLACEHOLDER_USER = {
    email: "engineer@audrolics.dev",
    role: "ENGINEER" as const,
  };
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const [items, setItems] = useState<StoredSchematicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoredSchematicSummary | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    async function fetchSchematics() {
      setLoading(true);
      setError(null);
      try {
        const schematics = await listSchematics(DEV_USER_ID);
        if (!cancelled) setItems(schematics);
      } catch (err) {
        if (!cancelled)
          setError(formatSchematicError(err, "Unable to load schematics"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchSchematics();
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      const deleted = await deleteSchematic(DEV_USER_ID, pendingDelete.id);
      if (deleted) {
        setItems((current) =>
          current.filter((item) => item.id !== pendingDelete.id),
        );
      }
    } catch (err) {
      setError(formatSchematicError(err, "Unable to delete schematic"));
    } finally {
      setPendingDelete(null);
    }
  }

  // Derived filtering – no extra state, no re-fetch
  const filteredItems = query.trim()
    ? items.filter((item) =>
        item.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : items;

  function handleSignOut() {
    setProfileOpen(false);
    // TODO(auth): clear the real session/refresh cookie, then redirect to sign-in.
    // Per SRS §8: invalidate the 7-day HTTP-only refresh-token cookie,
    // then navigate to the sign-in page.
    router.replace("/");
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-100 text-slate-950">
      <header className="flex h-22 shrink-0 items-center justify-between border-b border-slate-300 bg-white px-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/logo.svg" alt="Logo" width={32} height={32} className="h-6 w-6 ml-6" />
          <h1 className="text-[1rem] opacity-77 pl-1 font-poppins">Audrolics</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <label htmlFor="schematic-search" className="sr-only">
            Search schematics
          </label>
          <input
            id="schematic-search"
            type="search"
            aria-label="Search schematics"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search schematics…"
            className="w-64 h-8 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 placeholder:text-slate-400 focus:border-cyan-700 focus:outline-none focus:ring-1 focus:ring-cyan-700"
          />
          {/* Profile chip */}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={profileOpen}
            aria-label={PLACEHOLDER_USER.email}
            onClick={() => setProfileOpen((open) => !open)}
            className="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:border-cyan-700 hover:text-cyan-800"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-cyan-700 font-medium text-xs">
              {PLACEHOLDER_USER.email.charAt(0).toUpperCase()}
            </span>
            <span className="hidden sm:inline truncate max-w-[140px]">
              {PLACEHOLDER_USER.email}
            </span>
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl p-6">
        {loading && (
          <div className="rounded border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
            Loading schematics…
          </div>
        )}

        {!loading && error && (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* No results for search (items exist but filtered to empty) */}
        {!loading && !error && items.length > 0 && filteredItems.length === 0 && (
          <div className="rounded border border-dashed border-slate-300 bg-white p-12 text-center">
            <h2 className="text-base font-semibold text-slate-900">
              No schematics match &ldquo;{query}&rdquo;
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Try a different search term or clear the filter.
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-4 h-8 rounded border border-cyan-700 bg-cyan-700 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-cyan-800"
            >
              Clear search
            </button>
          </div>
        )}

        {/* Genuine empty state (no schematics at all, no active query) */}
        {!loading && !error && items.length === 0 && query.trim() === "" && (
          <div className="rounded border border-dashed border-slate-300 bg-white p-12 text-center">
            <h2 className="text-base font-semibold text-slate-900">
              No schematics yet
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Create your first schematic to get started.
            </p>
            <button
              type="button"
              onClick={() => router.push("/builder")}
              className="mt-4 h-8 rounded border border-cyan-700 bg-cyan-700 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-cyan-800"
            >
              New Schematic
            </button>
          </div>
        )}

        {/* List with New Schematic button in body */}
        {!loading && !error && items.length > 0 && (
          <>
            <div className="mb-4">
              <button
                type="button"
                onClick={() => router.push("/builder")}
                className="h-8 rounded border border-cyan-700 bg-cyan-700 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-cyan-800 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-cyan-700"
              >
                New Schematic
              </button>
            </div>
            <div className="space-y-3">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-900">
                      {item.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Updated {formatDate(item.updated_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/builder?id=${encodeURIComponent(item.id)}`)
                      }
                      className="h-8 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:border-cyan-700 hover:text-cyan-800"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(item)}
                      className="h-8 rounded border border-red-200 bg-white px-3 text-xs font-medium text-red-700 shadow-sm transition hover:border-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Empty search with no items - show New Schematic anyway */}
        {!loading && !error && items.length === 0 && query.trim() !== "" && (
          <div className="rounded border border-dashed border-slate-300 bg-white p-12 text-center">
            <h2 className="text-base font-semibold text-slate-900">
              No schematics match &ldquo;{query}&rdquo;
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Try a different search term or clear the filter.
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-4 h-8 rounded border border-cyan-700 bg-cyan-700 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-cyan-800"
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        open={pendingDelete !== null}
        title="Delete schematic?"
        onClose={() => setPendingDelete(null)}
        actions={
          <>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="h-8 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:border-cyan-700 hover:text-cyan-800"
            >
              Keep schematic
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              className="h-8 rounded border border-red-700 bg-red-700 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-red-800"
            >
              Delete schematic
            </button>
          </>
        }
      >
        <p>
          This will permanently delete{" "}
          <strong>{pendingDelete?.name}</strong> from the Express/MongoDB
          backend. This action cannot be undone.
        </p>
      </Modal>

      {/* Profile popover modal */}
      <Modal
        open={profileOpen}
        title="Your profile"
        onClose={() => setProfileOpen(false)}
        actions={
          <>
            <button
              type="button"
              onClick={handleSignOut}
              className="h-8 rounded border border-red-700 bg-red-700 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-red-800"
            >
              Sign out
            </button>
          </>
        }
      >
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="mt-1 font-medium text-slate-900">{PLACEHOLDER_USER.email}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Role</dt>
            <dd className="mt-1 font-medium text-slate-900">{PLACEHOLDER_USER.role}</dd>
          </div>
        </dl>
      </Modal>
    </main>
  );
}

export default SchematicsPage;