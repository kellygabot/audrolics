"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "@/lib/session";

export default function AccountMenu({ appearance = "filled" }: { appearance?: "filled" | "outline" }) {
  const { user, logout } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!user) return null;

  async function signOut() {
    setSigningOut(true);
    setOpen(false);
    try {
      await logout();
    } finally {
      router.replace("/");
      setSigningOut(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`flex max-w-[min(14rem,42vw)] items-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#021eef] sm:max-w-64 sm:px-6 sm:text-base ${appearance === "outline" ? "border border-[#021eef] bg-white text-[#021eef] hover:bg-[#eef1ff]" : "bg-[#021eef] text-white shadow-[0_7px_18px_rgba(2,30,239,0.2)] hover:bg-[#0018c7]"}`}
      >
        <span className="truncate">{user.fullName}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="dialog"
          aria-label="Account details"
          className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(18rem,calc(50vw-2rem))] overflow-hidden rounded-xl bg-white text-[#202638] shadow-[0_20px_55px_rgba(15,25,65,0.2)]"
        >
          <div className="relative flex h-32 items-start justify-end overflow-hidden bg-gradient-to-r from-[#2b43ff] to-[#57c8ff] p-5">
            <Image src="/logo-white.svg" alt="" width={145} height={145} className="pointer-events-none absolute -bottom-3 left-0 h-36 w-36 object-contain opacity-60" />
            <button
              type="button"
              disabled={signingOut}
              onClick={() => void signOut()}
              className="relative rounded-xl border border-[#0018d8] bg-white px-4 py-1.5 text-sm font-bold text-[#021eff]/73 transition-colors hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
            >
              Sign Out
            </button>
          </div>
          <div className="space-y-5 px-6 py-6">
            <h2 className="break-words text-xl font-semibold leading-tight text-[#202638]">{user.fullName}</h2>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-medium text-[#6b7280]">Email</dt>
                <dd className="mt-1 break-all text-[#202638]">{user.email}</dd>
              </div>
              <div>
                <dt className="font-medium text-[#6b7280]">Role</dt>
                <dd className="mt-1 text-[#202638]">{user.role === "ADMIN" ? "Admin" : "User"}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
