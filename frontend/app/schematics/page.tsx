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
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
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
    <main className="min-h-screen bg-white text-[#444]">
      <header className="h-22 w-full flex bg-white px-6 text-foreground shadow-[0_4px_30px_rgba(0,0,0,0.3)] justify-between items-center pb-1">
        <div className="flex min-w-0 items-center gap-3 ">
          <Image src="/logo.svg" alt="Logo" width={32} height={32} className="h-6 w-6 ml-6" />
          <h1 className="text-[1rem] opacity-77 pl-1 font-poppins">Audrolics</h1>
          {/* Search */}
          <div className='w-[50vw] flex items-center '>
            <label htmlFor="schematic-search" className="sr-only">
              Search schematics
            </label>
            <input
              type="search"
              id="schematic-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Title"
              className="
                w-full h-12 ml-15 rounded-full bg-[#f0f3ff] py-3 pl-6 pr-14 placeholder-slate-500 outline-none transition-all focus:ring-2 focus:ring-indigo-300
              "
            />
            <Image
              src="/search.svg"
              alt=""
              width={32}
              height={32}
              className="h-10 w-10 z-2 pointer-events-none relative inset-y-0 right-12 flex items-center pr-4 opacity-70"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 border h-12 rounded-full border-[#0018d8] hover:bg-gray-50">
          {/* Profile chip */}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={profileOpen}
            aria-label={PLACEHOLDER_USER.email}
            onClick={() => setProfileOpen((open) => !open)}
            className="flex items-center h-12 gap-2 p-4"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-cyan-700 font-medium text-xs">
              {PLACEHOLDER_USER.email.charAt(0).toUpperCase()}
            </span>
            <span className="hidden sm:inline truncate max-w-35">
              {PLACEHOLDER_USER.email}
            </span>
          </button>
        </div>
      </header>

      <section className="relative isolate flex min-h-[clamp(330px,31vw,480px)] w-full items-center overflow-hidden bg-[#f0f3ff]" aria-labelledby="new-document-title">
        <Image
          src="/s-logo.svg"
          alt=""
          width={393}
          height={421}
          className="pointer-events-none absolute -bottom-3 -left-8 z-0 h-[clamp(230px,30vw,420px)] w-auto max-w-none"
        />
        <Image
          src="/droplet.svg"
          alt=""
          width={392}
          height={455}
          className="pointer-events-none absolute -right-8 -top-14 z-0 h-[clamp(180px,20vw,310px)] w-auto max-w-none"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-[1700px] flex-col items-center gap-7 px-6 py-12 sm:flex-row sm:justify-center sm:gap-[clamp(32px,3vw,60px)] lg:justify-start lg:pl-[clamp(240px,27vw,410px)] lg:pr-[clamp(90px,9vw,170px)]">
          <h2 id="new-document-title" className="w-[clamp(220px,18vw,300px)] shrink-0 text-center text-[clamp(27px,2.65vw,50px)] font-bold leading-[1.1] tracking-tight sm:text-right">
            Start a New Audrolics Document
          </h2>
        <button
          type="button"
          onClick={() => router.push("/builder")}
          aria-label="New Schematic — Blank Document"
          className="flex h-[clamp(230px,20vw,330px)] w-[clamp(270px,28vw,530px)] shrink-0 flex-col items-center justify-center rounded-2xl border border-[#969696] bg-white shadow-[20px_25px_45px_rgba(30,35,60,0.16)] transition hover:border-[#102de6] hover:shadow-[20px_25px_55px_rgba(30,35,60,0.22)] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#102de6]"
        >
          <Image src="/plus.svg" alt="" width={100} height={100} className="mb-5 h-[clamp(64px,7vw,105px)] w-auto opacity-60" />
          <span className="text-[clamp(20px,1.75vw,32px)] text-[#969696]">Blank Document</span>
        </button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1840px] px-[clamp(24px,6vw,110px)] py-[clamp(48px,5vw,90px)]" aria-labelledby="recent-documents-title">
        <h2 id="recent-documents-title" className="mb-8 text-[clamp(24px,1.8vw,34px)] font-normal text-[#444]">Recent Audrolics Documents</h2>
        {loading && <p className="text-[#777]" role="status">Loading schematics…</p>}
        {!loading && error && <p className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700" role="alert">{error}</p>}
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
          <div className="flex min-h-[clamp(220px,17vw,310px)] w-full max-w-[520px] items-center justify-center gap-5 rounded-2xl bg-[#f0f3ff] px-8 py-10">
            <Image src="/box.svg" alt="" width={144} height={144} className="h-[clamp(90px,9vw,144px)] w-auto shrink-0" />
            <p className="max-w-[200px] text-[clamp(19px,1.55vw,29px)] font-bold leading-[1.18] text-[#c1c2cc]">
              No Audrolics files created yet
            </p>
          </div>
        )}

        {/* Recent documents */}
        {!loading && !error && items.length > 0 && (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="group overflow-hidden rounded-2xl border border-[#999] bg-white transition hover:border-[#112de5] hover:shadow-[0_18px_35px_rgba(30,35,60,0.12)] focus-within:border-[#112de5]"
                >
                  <button type="button" onClick={() => router.push(`/builder?id=${encodeURIComponent(item.id)}`)} className="block h-[clamp(180px,15vw,280px)] w-full border-b border-[#aaa] bg-white focus-visible:outline-4 focus-visible:outline-[#112de5]" aria-label={`Open ${item.name}`} />
                  <div className="flex min-h-25 items-end justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-[clamp(17px,1.3vw,24px)] font-normal text-[#555]">{item.name}</h3>
                      <p className="mt-1 flex items-center gap-2 truncate text-[clamp(13px,1vw,18px)] text-[#999]">
                        <Image src="/logo.svg" alt="" width={20} height={20} className="h-5 w-5 shrink-0" />
                        Updated {formatDate(item.updated_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(item)}
                      aria-label={`Delete ${item.name}`}
                      title={`Delete ${item.name}`}
                      className="shrink-0 rounded-full px-2 py-1 text-2xl leading-none text-[#aaa] transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-[#112de5]"
                    >
                      ⋮
                    </button>
                  </div>
                </div>
              ))}
          </div>
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
      </section>

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
