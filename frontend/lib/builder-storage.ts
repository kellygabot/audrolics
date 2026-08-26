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

type ApiErrorDetail =
  | string
  | {
      error_code?: string;
      message?: string;
    }
  | Array<{
      msg?: string;
      loc?: unknown[];
    }>;

export class SchematicApiError extends Error {
  status: number;
  detail: ApiErrorDetail | undefined;

  constructor(status: number, detail: ApiErrorDetail | undefined) {
    super(formatApiError(status, detail));
    this.name = "SchematicApiError";
    this.status = status;
    this.detail = detail;
  }
}

const SCHEMATICS_PATH = "/api/v1/schematics";
const SERVER_MANAGED_FIELDS = new Set(["id", "user_id", "created_at", "updated_at"]);

const requestJson = async <T>(path: string, userId: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      "X-User-Id": userId || "dev-user",
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new SchematicApiError(response.status, extractDetail(body));
  }
  return body as T;
};

export const listSchematics = async (userId = "dev-user"): Promise<StoredSchematicSummary[]> =>
  requestJson<StoredSchematicSummary[]>(SCHEMATICS_PATH, userId);

export const saveSchematic = async <T extends Record<string, unknown>>(
  userId: string,
  model: T,
): Promise<T & StoredSchematic> => {
  const existingId = getPersistedSchematicId(model);
  const saved = existingId
    ? await requestJson<T & StoredSchematic>(`${SCHEMATICS_PATH}/${encodeURIComponent(existingId)}`, userId, {
        method: "PUT",
        body: JSON.stringify(stripServerManagedFields(model)),
      })
    : await requestJson<T & StoredSchematic>(SCHEMATICS_PATH, userId, {
        method: "POST",
        body: JSON.stringify(stripServerManagedFields(model)),
      });

  return saved;
};

export const loadSchematic = async <T>(userId: string, schematicId: string): Promise<T | null> => {
  try {
    return await requestJson<T>(`${SCHEMATICS_PATH}/${encodeURIComponent(schematicId)}`, userId);
  } catch (error) {
    if (error instanceof SchematicApiError && error.status === 404) return null;
    throw error;
  }
};

export const deleteSchematic = async (userId: string, schematicId: string): Promise<boolean> => {
  try {
    await requestJson<void>(`${SCHEMATICS_PATH}/${encodeURIComponent(schematicId)}`, userId, {
      method: "DELETE",
    });
    return true;
  } catch (error) {
    if (error instanceof SchematicApiError && error.status === 404) return false;
    throw error;
  }
};

export const clearLocalSchematicLibrary = () => {
  // Kept as a no-op compatibility hook for older tests and manual browser cleanup.
  // Schematics now persist through the backend repository/database.
};

const getPersistedSchematicId = (model: Record<string, unknown>): string | null => {
  if (typeof model.id !== "string") return null;
  return typeof model.created_at === "string" || typeof model.updated_at === "string" ? model.id : null;
};

const stripServerManagedFields = (model: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(model).filter(([key]) => !SERVER_MANAGED_FIELDS.has(key)));

const readResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const extractDetail = (body: unknown): ApiErrorDetail | undefined => {
  if (body && typeof body === "object" && "detail" in body) {
    return (body as { detail?: ApiErrorDetail }).detail;
  }
  return typeof body === "string" ? body : undefined;
};

const formatApiError = (status: number, detail: ApiErrorDetail | undefined): string => {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const message = detail
      .map((item) => item.msg)
      .filter(Boolean)
      .join("; ");
    if (message) return message;
  }
  if (detail && !Array.isArray(detail) && typeof detail !== "string" && detail.message) {
    return detail.message;
  }
  return `Schematic API request failed with status ${status}.`;
};
