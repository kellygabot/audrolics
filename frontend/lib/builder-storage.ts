export type StoredSchematicSummary = {
  id: string;
  name: string;
  updated_at: string;
};

type StoredSchematic = Record<string, unknown> & {
  id: string;
  name: string;
  updated_at: string;
  created_at?: string;
};

const LIBRARY_KEY = "audrolics.builder.localLibrary";
const libraryKey = (userId: string) => `${LIBRARY_KEY}.${userId || "dev-user"}`;

const readLibrary = (userId: string): StoredSchematic[] => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(libraryKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    window.localStorage.removeItem(libraryKey(userId));
    return [];
  }
};

const writeLibrary = (userId: string, schematics: StoredSchematic[]) => {
  window.localStorage.setItem(libraryKey(userId), JSON.stringify(schematics));
};

export const listSchematics = async (userId = "dev-user"): Promise<StoredSchematicSummary[]> =>
  readLibrary(userId)
    .map(({ id, name, updated_at }) => ({ id, name, updated_at }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

export const saveSchematic = async <T extends Record<string, unknown>>(userId: string, model: T): Promise<T & StoredSchematic> => {
  const now = new Date().toISOString();
  const existingId = typeof model.id === "string" ? model.id : undefined;
  const saved = {
    ...model,
    id: existingId ?? `local-${crypto.randomUUID()}`,
    name: typeof model.name === "string" && model.name.trim() ? model.name : "Untitled schematic",
    created_at: typeof model.created_at === "string" ? model.created_at : now,
    updated_at: now,
  } as T & StoredSchematic;
  const next = [saved, ...readLibrary(userId).filter((schematic) => schematic.id !== saved.id)];
  writeLibrary(userId, next);
  return saved;
};

export const loadSchematic = async <T>(userId: string, schematicId: string): Promise<T | null> => {
  const schematic = readLibrary(userId).find((item) => item.id === schematicId);
  return schematic ? (structuredClone(schematic) as T) : null;
};

export const deleteSchematic = async (userId: string, schematicId: string): Promise<boolean> => {
  const current = readLibrary(userId);
  const next = current.filter((schematic) => schematic.id !== schematicId);
  writeLibrary(userId, next);
  return next.length !== current.length;
};

export const clearLocalSchematicLibrary = (userId = "dev-user") => {
  if (typeof window !== "undefined") window.localStorage.removeItem(libraryKey(userId));
};
