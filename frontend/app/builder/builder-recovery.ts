import { currentAccountId } from "@/lib/session";
import type { SchematicModel } from "./builder-model";

export const recoveryKey = () => `audrolics.builder.recovery.${currentAccountId()}`;

export function readRecoveryModel(): SchematicModel | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem(recoveryKey());
  if (!raw) return null;
  try {
    const recovered = JSON.parse(raw) as SchematicModel;
    return recovered?.nodes && recovered?.links ? recovered : null;
  } catch {
    window.localStorage.removeItem(recoveryKey());
    return null;
  }
}
