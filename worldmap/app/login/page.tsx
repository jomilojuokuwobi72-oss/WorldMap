"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import MapboxMap from "@/components/MapboxMap";
import WorldMapLogo from "@/components/worldMapLogo";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error("No user returned from login.");

      // Fetch their slug so we can route to /[slug]
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("share_slug")
        .eq("id", userId)
        .single();

      if (profErr) throw profErr;

      const slug = prof?.share_slug;
      if (!slug) {
        // Profile not created yet (rare if onboarding always completes)
        router.push("/signup");
        return;
      }

      router.push(`/${slug}`);
    } catch (e: any) {
      setError(e?.message ?? "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-white/20 focus:bg-black/35";

  const btn =
    "inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50";

  return (
    <main className="min-h-[100svh] w-full bg-black text-white">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <MapboxMap />
        <div className="absolute inset-0 bg-black/80" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_30%,rgba(255,255,255,0.10),transparent_44%),radial-gradient(circle_at_70%_60%,rgba(255,255,255,0.06),transparent_55%)]" />
      </div>

      <div className="mx-auto flex min-h-[100svh] max-w-3xl flex-col px-5 sm:px-6">
        <header className="flex items-center justify-between py-5 sm:py-6">
          <button onClick={() => router.push("/")} aria-label="Home">
            <WorldMapLogo className="text-white" />
          </button>

          <button
            onClick={() => router.push("/signup")}
            className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
          >
            Join early
          </button>
        </header>

        <section className="flex flex-1 items-center justify-center pb-10">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-black/55 shadow-2xl backdrop-blur">
            <div className="border-b border-white/10 p-6">
              <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
              <p className="mt-2 text-sm text-white/65">Sign in to add and manage your pins + memories.</p>
            </div>

            <form className="grid gap-3 p-6" onSubmit={handleLogin}>
              <input
                className={inputClass}
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <input
                className={inputClass}
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />

              {error ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {error}
                </div>
              ) : null}

              <button type="submit" className={btn} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={16} /> : null}
                Login
              </button>

              <div className="text-center text-xs text-white/55">
                Don’t have an account?{" "}
                <button
                  type="button"
                  className="underline hover:text-white"
                  onClick={() => router.push("/signup")}
                >
                  Sign up
                </button>
              </div>
            </form>
          </div>
        </section>

        <footer className="pb-6 text-xs text-white/40">© {new Date().getFullYear()} worldmap</footer>
      </div>
    </main>
  );
}