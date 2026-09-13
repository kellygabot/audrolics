"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export default function Modal({
  open,
  title,
  onClose,
  children,
  actions,
  initialFocusRef,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      const target = initialFocusRef?.current ?? dialogRef.current;
      if (target) {
        // Defer focus to next tick so the DOM is settled
        window.setTimeout(() => target.focus(), 0);
      }
    } else {
      returnFocusRef.current?.focus?.();
      returnFocusRef.current = null;
    }
  }, [open, initialFocusRef]);

  const trapFocus = useCallback(
    (event: globalThis.KeyboardEvent) => {
      const container = dialogRef.current;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        trapFocus(event);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, trapFocus]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="w-full max-w-md rounded border border-slate-300 bg-white p-5 shadow-lg outline-none"
      >
        <h2 id="modal-title" className="text-base font-semibold text-slate-950">
          {title}
        </h2>
        <div className="mt-3 text-sm leading-6 text-slate-600">{children}</div>
        {actions && (
          <div className="mt-5 flex justify-end gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
