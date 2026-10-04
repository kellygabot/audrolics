'use client';

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";

interface AuthModalProps {
  mode: "login" | "signup";
  onClose: () => void;
  onSwitchMode: (mode: "login" | "signup") => void;
}

export default function AuthModal({
  mode,
  onClose,
  onSwitchMode,
}: AuthModalProps) {
  const router = useRouter();
  const { accept } = useSession();
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset errors when switching between login and signup
  const handleSwitchMode = (newMode: "login" | "signup") => {
    setError(null);
    onSwitchMode(newMode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Uses relative paths mapped by next.config.ts rewrites
    const endpoint = mode === "signup"
      ? "/api/v1/auth/register"
      : "/api/v1/auth/login";

    const payload = mode === "signup"
      ? { email, password, fullName }
      : { email, password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail?.message || data.message || "An error occurred during authentication.");
      }

      accept(data);
      onClose();
      router.push(data.user.role === "ADMIN" ? "/admin" : "/schematics");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 font-poppins">
      {/* Background Overlay */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Main Container */}
      <div 
        className={`relative z-10 w-212.5 min-h-137.5  bg-white rounded-[3rem] shadow-2xl overflow-hidden flex ${
          mode === "login" ? "flex-row" : "flex-row-reverse"
        }`}
      >
        {/* ======================= */}
        {/*       FORM SECTION      */}
        {/* ======================= */}
        <div className="w-1/2 p-12 flex flex-col justify-center bg-white">
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold">
              {error}
            </div>
          )}

          {mode === "login" ? (
            /* --- LOGIN FORM --- */
            <>
              <div className="flex items-center gap-3 mb-8">
                <Image src="/logo.svg" alt="Logo" width={24} height={24} className="h-6 w-6" />
                <span className="text-gray-700 text-sm">Audrolics</span>
              </div>
              <p className="text-[#021eef] text-[0.65rem] font-extrabold uppercase tracking-widest mb-1">
                RIGHT WHERE YOU LEFT OFF
              </p>
              <h2 className="text-3xl font-extrabold text-black mb-1">
                Welcome back
              </h2>
              <p className="text-[0.75rem] mb-8">
                Sign in to continue to your account.
              </p>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-[0.70rem] font-bold text-black mb-1.5">
                    Email address
                  </label>
                  <div className="relative flex items-center">
                    <Image src="/email.svg" alt="Email Icon" width={16} height={16} className="absolute left-3 opacity-40" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@company.com"
                      className="w-full pl-9 pr-4 py-2.5 rounded-[0.75rem] bg-[#f4f4f5] border border-gray-200 text-sm focus:outline-none focus:border-[#021eef] focus:bg-white focus:ring-1 focus:ring-[#021eef] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[0.70rem] font-bold text-black mb-1.5">
                    Password
                  </label>
                  <div className="relative flex items-center">
                    <Image src="/password.svg" alt="Lock Icon" width={12} height={12} className="absolute left-3.5 opacity-40" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="Enter your password"
                      className="w-full pl-9 pr-4 py-2.5 rounded-[0.75rem] bg-[#f4f4f5] border border-gray-200 text-sm focus:outline-none focus:border-[#021eef] focus:bg-white focus:ring-1 focus:ring-[#021eef] transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-4 bg-[#021eef] text-white py-3 rounded-[0.75rem] font-bold text-[0.85rem] shadow-lg hover:bg-[#0015ba] transition-colors disabled:opacity-50"
                >
                  {loading ? "Signing in..." : "Log in"}
                </button>
              </form>
            </>
          ) : (
            /* --- SIGNUP FORM --- */
            <>
              <p className="text-[#021eef] text-[0.60rem] font-extrabold uppercase tracking-widest mb-1 mt-6">
                BUILD HYDRAULIC SCHEMATICS IN MINUTES
              </p>
              <h2 className="text-3xl font-extrabold text-black mb-6">
                Create your account
              </h2>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-[0.70rem] font-bold text-black mb-1.5">
                    Full Name
                  </label>
                  <div className="relative flex items-center">
                    <Image src="/user.svg" alt="User Icon" width={16} height={16} className="absolute left-3 opacity-40" />
                    <input
                      type="text"
                      value={fullName}
                      required
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Juan Dela Cruz"
                      className="w-full pl-9 pr-4 py-2.5 rounded-[0.75rem] bg-[#f4f4f5] border border-gray-200 text-sm focus:outline-none focus:border-[#021eef] focus:bg-white focus:ring-1 focus:ring-[#021eef] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[0.70rem] font-bold text-black mb-1.5">
                    Email address
                  </label>
                  <div className="relative flex items-center">
                    <Image src="/email.svg" alt="Email Icon" width={16} height={16} className="absolute left-3 opacity-40" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@company.com"
                      className="w-full pl-9 pr-4 py-2.5 rounded-[0.75rem] bg-[#f4f4f5] border border-gray-200 text-sm focus:outline-none focus:border-[#021eef] focus:bg-white focus:ring-1 focus:ring-[#021eef] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[0.70rem] font-bold text-black mb-1.5">
                    Password
                  </label>
                  <div className="relative flex items-center">
                    <Image src="/password.svg" alt="Lock Icon" width={12} height={12} className="absolute left-3.5 opacity-40" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="At least 8 characters"
                      className="w-full pl-9 pr-4 py-2.5 rounded-[0.75rem] bg-[#f4f4f5] border border-gray-200 text-sm focus:outline-none focus:border-[#021eef] focus:bg-white focus:ring-1 focus:ring-[#021eef] transition-colors"
                    />
                  </div>
                  <p className="text-[0.60rem] text-[#8a8a8a] mt-1.5 ml-1">
                    Use 8+ characters.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2 pb-2">
                  <input type="checkbox" required className="w-3.5 h-3.5 rounded border-gray-300 text-[#021eef] focus:ring-[#021eef]" />
                  <span className="text-[0.65rem] text-gray-500">
                    I agree to the <span className="font-bold text-black">Terms and Privacy Policy</span>.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#021eef] text-white py-3 rounded-[0.75rem] font-bold text-[0.85rem] shadow-lg hover:bg-[#0015ba] transition-colors disabled:opacity-50"
                >
                  {loading ? "Creating account..." : "Create account"}
                </button>
              </form>
            </>
          )}
        </div>

        {/* ======================= */}
        {/*     GRADIENT SECTION    */}
        {/* ======================= */}
        <div className="w-1/2 bg-gradient-to-br from-[#2b43ff] to-[#57c8ff] text-white flex flex-col items-center justify-center text-center relative">
          
          {mode === "login" ? (
            /* --- LOGIN GRADIENT INFO --- */
            <>
              <Image src="/ru-new.svg" alt="Graphic" width={400} height={400} className="mt-[-90px] mb-[-90px] relative z-10" />
              <p className="text-[0.65rem] font-extrabold uppercase tracking-widest text-white/90 mb-2">
                MAKE IT YOURS
              </p>
              <h3 className="text-4xl font-extrabold mb-4 leading-tight">
                Are you<br />new here?
              </h3>
              <p className="text-[0.80rem] text-white/100 mb-10 max-w-[280px] leading-relaxed">
                Create a workspace, save your projects, and keep every bright idea within reach.
              </p>

              <button
                type="button"
                onClick={() => handleSwitchMode("signup")}
                className="px-6 py-2.5 rounded-lg border border-white/40 bg-white/10 hover:bg-white/20 backdrop-blur-md text-[0.80rem] font-bold transition-all flex items-center gap-2 shadow-sm"
              >
                Create account <Image src="/arrow.svg" alt="Arrow Right" width={12} height={12} />
              </button>
            </>
          ) : (
            /* --- SIGNUP GRADIENT INFO --- */
            <>
              <Image src="/alr.svg" alt="Graphic" width={400} height={400} className="m-[-90px] relative z-10" />
              <p className="text-[0.65rem] font-extrabold uppercase tracking-widest text-white/90 mb-2">
                GOOD TO HAVE YOU BACK
              </p>
              <h3 className="text-4xl font-extrabold mb-4 leading-tight">
                Already have an<br />account?
              </h3>
              <p className="text-[0.80rem] text-white/90 mb-10 max-w-[280px] leading-relaxed">
                Your projects are right where you left<br /> them. Log in and pick up the thread.
              </p>

              <button
                type="button"
                onClick={() => handleSwitchMode("login")}
                className="px-6 py-2.5 rounded-lg border border-white/40 bg-white/10 hover:bg-white/20 backdrop-blur-md text-[0.80rem] font-bold transition-all flex items-center gap-2 shadow-sm"
              >
                <Image src="/arrow.svg" alt="Arrow Left" width={12} height={12} className="rotate-180"/> Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}