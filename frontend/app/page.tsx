"use client";

import { useState } from "react";
import AuthModal from "@/components/auth/page";
import Header from "@/components/header/page";
import LandingPage from "@/components/landing/page";

type AuthMode = "login" | "signup";

export default function Home() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  return (
    <div>
      <main>
        <Header onOpenAuth={setAuthMode} />
        <LandingPage />
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
