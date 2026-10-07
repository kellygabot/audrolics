"use client";

import { useEffect, useState } from "react";
import AuthModal from "@/components/auth/page";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import Header from "@/components/header/page";
import LandingPage from "@/components/landing/page";

type AuthMode = "login" | "signup";

export default function Home() {
  const { user, ready } = useSession();
  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  useEffect(() => { if (ready && !user && new URLSearchParams(window.location.search).get("login") === "1") { const timer = window.setTimeout(() => setAuthMode("login"), 0); return () => window.clearTimeout(timer); } }, [ready, user]);
  const createNow = () => user ? router.push(user.role === "ADMIN" ? "/admin" : "/schematics") : setAuthMode("login");

  return (
    <div>
      <main>
        <Header onOpenAuth={setAuthMode} />
        <LandingPage onCreate={createNow} />
      </main>
      {authMode ? (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onSwitchMode={setAuthMode}
        />
      ) : null}
    </div>
  );
}
