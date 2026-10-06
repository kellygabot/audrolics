import { useState, type Dispatch, type SetStateAction } from "react";
import { defaultModel, HISTORY_LIMIT, type HistoryState, type SchematicModel } from "./builder-model";

// Whole-document snapshots keep connected graph edits and their undo step together.
export function useBuilderHistory(setStatusMessage: Dispatch<SetStateAction<string>>) {
  const [model, setModel] = useState(defaultModel);
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] });

  function commit(update: (draft: SchematicModel) => SchematicModel, message?: string) {
    setModel((current) => {
      const next = update(structuredClone(current));
      setHistory((state) => ({
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), current],
        future: [],
      }));
      return next;
    });
    if (message) setStatusMessage(message);
  }

  function undo() {
    setHistory((state) => {
      const previous = state.past.at(-1);
      if (!previous) return state;
      setModel(previous);
      return { past: state.past.slice(0, -1), future: [model, ...state.future] };
    });
  }

  function redo() {
    setHistory((state) => {
      const next = state.future[0];
      if (!next) return state;
      setModel(next);
      return { past: [...state.past, model].slice(-HISTORY_LIMIT), future: state.future.slice(1) };
    });
  }

  return { model, setModel, history, setHistory, commit, undo, redo };
}
