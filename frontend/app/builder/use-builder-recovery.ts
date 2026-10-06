import { useEffect, useMemo, useState } from "react";
import { defaultModel, type SchematicModel } from "./builder-model";
import { toApiPayload } from "./builder-graph";
import { recoveryKey } from "./builder-recovery";

// Mongo saves are explicit; this hook only manages the browser's recovery draft.
export function useBuilderRecovery(model: SchematicModel) {
  const [recoveryCandidate, setRecoveryCandidate] = useState<SchematicModel | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(() =>
    JSON.stringify(toApiPayload(defaultModel())),
  );
  const isDirty = useMemo(
    () => JSON.stringify(toApiPayload(model)) !== lastSavedSnapshot,
    [model, lastSavedSnapshot],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      localStorage.setItem(recoveryKey(), JSON.stringify(model));
    }, 30000);
    return () => window.clearInterval(interval);
  }, [model]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  return {
    recoveryCandidate, setRecoveryCandidate,
    lastSavedSnapshot, setLastSavedSnapshot, isDirty,
  };
}
