"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/modal/page";
import {
  deleteSchematic,
  listSchematics,
  formatSchematicError,
} from "../../lib/builder-storage";

const DEV_USER_ID = "dev-user";

type SchematicItem = {
  id: string;
  name: string;
  updated_at: string;
};

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString();
  } catch {
    return iso;
  }
}

export default function SchematicsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SchematicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SchematicItem | null>(
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

  return (
    <main className="flex min-h-screen flex-col bg-slate-100 text-slate-950">
      <header className="flex h-22 shrink-0 items-center justify-between border-b border-slate-300 bg-white px-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/logo.svg" alt="Logo" width={32} height={32} className="h-8 w-8 ml-4" />
          <h1 className="text-[1.3rem] opacity-66 pl-4 font-poppins">Audrolics</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/builder")}
            className="h-8 rounded border border-cyan-700 bg-cyan-700 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-cyan-800 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-cyan-700"
          >
            New Schematic
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

        {!loading && !error && items.length === 0 && (
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

        {!loading && !error && items.length > 0 && (
          <div className="space-y-3">
            {items.map((item) => (
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
        )}
      </div>

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
    </main>
  );
}
