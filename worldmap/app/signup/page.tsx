// app/signup/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import MapboxMap from "@/components/MapboxMap";
import LocationInput from "@/components/LocationInput";
import WorldMapLogo from "@/components/worldMapLogo";
import { supabase } from "@/lib/supabaseClient";
import { upsertProfile } from "@/lib/auth";

type Step = 1 | 2 | 3;

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+)|(-+$)/g, "")
    .slice(0, 60);
}

function normalizePlaceKey(city?: string, region?: string, country?: string) {
  const parts = [city, region, country]
    .filter(Boolean)
    .map((s) => (s || "").trim().toLowerCase());
  return parts.join("|");
}

function makeLocalDateTimeValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

type MemoryDraft = {
  key: string;
  city: string;
  region: string;
  description: string; // short title (required)
  note: string; // long note (optional)
  dateLocal: string; // datetime-local
  file: File | null; // ONE photo per memory
};

const MAX_MEMORIES = 10;

function StepMeta(step: Step) {
  if (step === 1) return { title: "Create your account", desc: "Start with email + password." };
  if (step === 2) return { title: "Set up your profile", desc: "Pick a link, add a home city, optional photo." };
  return {
    title: "Add your first memories",
    desc: "Add 1–10 memories. Each needs a location + description + one photo.",
  };
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function SignupOnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After Step 1 we store auth user id (session exists)
  const [uid, setUid] = useState<string | null>(null);

  // Step 1: auth
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2: profile
  const [fullName, setFullName] = useState("");
  const [shareSlug, setShareSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false); // kept (even if not used elsewhere)
  const [tagline, setTagline] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [homeRegion, setHomeRegion] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Step 3: memories
  const [memories, setMemories] = useState<MemoryDraft[]>(() => [
    {
      key: crypto.randomUUID(),
      city: "",
      region: "",
      description: "",
      note: "",
      dateLocal: makeLocalDateTimeValue(new Date()),
      file: null,
    },
  ]);

  // ✅ New: which memory card is expanded
  const [openKey, setOpenKey] = useState<string | null>(memories[0]?.key ?? null);

  // ✅ New: scroll-to-new-card support
  const memoryCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Slug availability
  const normalizedSlug = useMemo(() => normalizeSlug(shareSlug), [shareSlug]);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");

  const meta = StepMeta(step);

  // Avatar preview
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  // Check slug (only step 2)
  useEffect(() => {
    let cancelled = false;

    async function checkSlug() {
      if (step !== 2) return;

      if (!shareSlug.trim()) {
        setSlugStatus("idle");
        return;
      }
      if (!normalizedSlug || normalizedSlug.length < 3) {
        setSlugStatus("invalid");
        return;
      }

      setSlugStatus("checking");
      await new Promise((r) => setTimeout(r, 250));
      if (cancelled) return;

      const { data, error } = await supabase.from("profiles").select("id").eq("share_slug", normalizedSlug).limit(1);

      if (cancelled) return;

      if (error) {
        console.warn("[slug-check] error:", error);
        setSlugStatus("available");
        return;
      }

      setSlugStatus(data && data.length > 0 ? "taken" : "available");
    }

    checkSlug();
    return () => {
      cancelled = true;
    };
  }, [shareSlug, normalizedSlug, step]);

  function canGoNext() {
    if (step === 1) return !!email && !!password;

    if (step === 2) {
      if (!uid) return false;
      if (!fullName.trim()) return false;
      if (!normalizedSlug || normalizedSlug.length < 3) return false;
      if (slugStatus === "taken" || slugStatus === "checking") return false;
      if (!homeCity.trim()) return false;
      return true;
    }

    return true;
  }

  function canFinish() {
    if (!uid) return false;
    if (memories.length < 1 || memories.length > MAX_MEMORIES) return false;

    for (const m of memories) {
      if (!m.city.trim() || !m.region.trim()) return false;
      if (!m.description.trim()) return false;
      if (!m.file) return false;
    }
    return true;
  }

  // STEP 1: create auth user + session
  async function handleCreateAccount() {
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      let userId = data.user?.id ?? null;

      // Fallback sign-in
      if (!userId) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) throw signInErr;
        userId = signInData.user?.id ?? null;
      }

      if (!userId) throw new Error("Could not create session after signup.");

      setUid(userId);
      setStep(2);
    } catch (e: any) {
      console.error("[signup-step1] error:", e);
      setError(e?.message ?? "Signup failed.");
    } finally {
      setLoading(false);
    }
  }

  async function uploadWithLogs(bucket: string, path: string, file: File) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });
    if (error) throw error;

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    return pub.publicUrl;
  }

  async function ensurePlace(city: string, region: string, country = "United States") {
    const normalized_key = normalizePlaceKey(city, region, country);

    const found = await supabase.from("places").select("id").eq("normalized_key", normalized_key).maybeSingle();
    if (found.error) throw found.error;
    if (found.data?.id) return found.data.id as string;

    const inserted = await supabase
      .from("places")
      .insert([{ city, region, country, normalized_key }])
      .select("id")
      .single();

    if (inserted.error) throw inserted.error;
    return inserted.data.id as string;
  }

  // STEP 2: save profile (+ avatar)
  async function handleSaveProfileAndNext() {
    if (loading) return;
    setError(null);

    if (!uid) {
      setError("No session found. Please create your account first.");
      return;
    }
    if (!canGoNext()) return;

    setLoading(true);

    try {
      let avatarUrl: string | undefined = undefined;

      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop() || "jpg";
        const path = `${uid}/avatar.${ext}`;
        avatarUrl = await uploadWithLogs("avatars", path, avatarFile);
      }

      const { error: profErr } = await upsertProfile(uid, {
        full_name: fullName,
        avatar_url: avatarUrl,
        tagline,
        home_city: homeCity,
        home_region: homeRegion,
        is_public: isPublic,
        share_slug: normalizedSlug, // user-controlled
      });

      if (profErr) {
        const msg = (profErr as any)?.message ?? "Failed to create profile.";
        if (msg.toLowerCase().includes("share_slug") || msg.toLowerCase().includes("duplicate")) {
          setError("This slug is already taken. Try a different one.");
        } else {
          setError(msg);
        }
        return;
      }

      setStep(3);

      // ✅ open first memory on entry
      requestAnimationFrame(() => {
        setOpenKey(memories[0]?.key ?? null);
      });
    } catch (e: any) {
      console.error("[signup-step2] error:", e);
      setError(e?.message ?? "Failed to save profile.");
    } finally {
      setLoading(false);
    }
  }

  // STEP 3: create memories
  async function handleFinish(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);

    if (!uid) {
      setError("No session found. Please create your account first.");
      return;
    }

    if (!canFinish()) {
      setError("Each memory needs a location + description + one photo.");
      return;
    }

    setLoading(true);

    try {
      for (let i = 0; i < memories.length; i++) {
        const m = memories[i];
        const city = m.city.trim();
        const region = m.region.trim();
        const happened_at = new Date(m.dateLocal).toISOString();

        const placeId = await ensurePlace(city, region, "United States");

        const pinLabel = `${city} Trip`;
        const upsertPin = await supabase
          .from("user_places")
          .upsert([{ user_id: uid, place_id: placeId, label: pinLabel, pinned: true }], {
            onConflict: "user_id,place_id" as any,
          });
        if (upsertPin.error) throw upsertPin.error;

        const memInsert = await supabase
          .from("memories")
          .insert([
            {
              user_id: uid,
              place_id: placeId,
              description: m.description || null,
              note: m.note || null,
              happened_at,
              visibility: isPublic ? "public" : "private",
            },
          ])
          .select("id")
          .single();
        if (memInsert.error) throw memInsert.error;

        const memoryId = memInsert.data.id as string;

        const file = m.file!;
        const ext = file.name.split(".").pop() || "jpg";
        const storage_path = `${uid}/${memoryId}/0.${ext}`;

        const uploadRes = await supabase.storage.from("memory-media").upload(storage_path, file, {
          upsert: true,
          contentType: file.type || "application/octet-stream",
        });
        if (uploadRes.error) throw uploadRes.error;

        const mediaRow = await supabase.from("memory_media").insert([
          {
            memory_id: memoryId,
            storage_path,
            media_type: "image",
            sort_order: 0,
            taken_at: happened_at,
          },
        ]);
        if (mediaRow.error) throw mediaRow.error;
      }

      router.push(`/${normalizedSlug}`);
    } catch (err: any) {
      console.error("[onboarding] error:", err);
      setError(err?.message ?? "Something went wrong creating your memories.");
    } finally {
      setLoading(false);
    }
  }

  function updateMemory(key: string, patch: Partial<MemoryDraft>) {
    setMemories((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }

  // ✅ New Step 3 add/remove: vertical list + scrollIntoView
  function addMemory() {
    if (loading) return;
    setError(null);

    setMemories((prev) => {
      if (prev.length >= MAX_MEMORIES) return prev;

      const nextKey = crypto.randomUUID();
      const next = [
        ...prev,
        {
          key: nextKey,
          city: "",
          region: "",
          description: "",
          note: "",
          dateLocal: makeLocalDateTimeValue(new Date()),
          file: null,
        },
      ];

      // open + scroll after mount
      requestAnimationFrame(() => {
        setOpenKey(nextKey);
        requestAnimationFrame(() => {
          memoryCardRefs.current[nextKey]?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

      return next;
    });
  }

  function removeMemory(key: string) {
    if (loading) return;
    setError(null);

    setMemories((prev) => {
      if (prev.length <= 1) return prev;

      const idx = prev.findIndex((m) => m.key === key);
      const next = prev.filter((m) => m.key !== key);

      // pick a neighbor to open
      const neighbor = next[Math.min(idx, next.length - 1)];
      requestAnimationFrame(() => {
        setOpenKey(neighbor?.key ?? null);
        if (neighbor?.key) {
          requestAnimationFrame(() => {
            memoryCardRefs.current[neighbor.key]?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      });

      return next;
    });
  }

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-white/20 focus:bg-black/35";

  const primaryBtn =
    "inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50";
  const softBtn =
    "inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-5 py-3 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50";
  const ghostBtn =
    "inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-transparent px-5 py-3 text-xs font-semibold text-white/75 hover:bg-white/5 disabled:opacity-50";

  const canGoBackToPrevStep = useMemo(() => {
    if (loading) return false;
    if (step === 1) return false;
    if (step === 2) return uid === null;
    if (step === 3) return true;
    return false;
  }, [step, uid, loading]);

  function handleBack() {
    if (!canGoBackToPrevStep) return;
    setError(null);

    if (step === 3) setStep(2);
    else if (step === 2 && uid === null) setStep(1);
  }

  return (
    <main className="min-h-[100svh] w-full bg-black text-white">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <MapboxMap />
        <div className="absolute inset-0 bg-black/80" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_30%,rgba(255,255,255,0.10),transparent_44%),radial-gradient(circle_at_70%_60%,rgba(255,255,255,0.06),transparent_55%)]" />
      </div>

      <div className="mx-auto flex min-h-[100svh] max-w-7xl flex-col px-4 sm:px-6">
        {/* Top nav */}
        <header className="flex items-center justify-between py-4 sm:py-6">
          <button onClick={() => router.push("/")} className="flex items-center gap-2">
            <WorldMapLogo className="text-white" />
          </button>

          <nav className="flex items-center gap-2 text-sm text-white/70">
            <button
              onClick={() => router.push("/")}
              className="rounded-full px-3 py-2 hover:bg-white/5 hover:text-white"
            >
              Home
            </button>
            <button
              onClick={() => router.push("/signup")}
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black hover:opacity-90"
            >
              Join early
            </button>
          </nav>
        </header>

        {/* Content */}
        <section className="grid flex-1 gap-8 pb-10 pt-2 md:grid-cols-2 md:gap-16 md:pt-6">
          {/* Card first on mobile */}
          <div className="order-1 md:order-2">
            <div className="mx-auto w-full max-w-xl overflow-hidden rounded-[28px] border border-white/10 bg-black/55 shadow-2xl backdrop-blur">
              {/* Header */}
              <div className="border-b border-white/10 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-white/60">Step {step} of 3</div>

                  <div className="flex items-center gap-2 text-[11px] text-white/60 sm:text-xs">
                    <span className={cn("inline-flex items-center gap-1", step >= 1 && "text-white")}>
                      <Check size={14} className={cn("opacity-60", step >= 1 && "opacity-100")} />
                      Account
                    </span>
                    <span className="text-white/30">•</span>
                    <span className={cn("inline-flex items-center gap-1", step >= 2 && "text-white")}>
                      <Check size={14} className={cn("opacity-60", step >= 2 && "opacity-100")} />
                      Profile
                    </span>
                    <span className="text-white/30">•</span>
                    <span className={cn("inline-flex items-center gap-1", step >= 3 && "text-white")}>
                      <Check size={14} className={cn("opacity-60", step >= 3 && "opacity-100")} />
                      Memories
                    </span>
                  </div>
                </div>

                <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">{meta.title}</h2>
                <p className="mt-2 text-sm text-white/65">{meta.desc}</p>
              </div>

              {/* Form body */}
              <form className="grid gap-3 p-5 sm:p-6" onSubmit={handleFinish}>
                {/* STEP 1 */}
                {step === 1 ? (
                  <>
                    <input
                      className={inputClass}
                      placeholder="Email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      name="email"
                    />
                    <input
                      className={inputClass}
                      placeholder="Password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      name="new_password"
                    />
                    <div className="text-xs text-white/55">
                      Create your account first, then set a profile link and add memories.
                    </div>
                  </>
                ) : null}

                {/* STEP 2 */}
                {step === 2 ? (
                  <>
                    <input
                      className={inputClass}
                      placeholder="Full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      name="full_name"
                      autoComplete="name"
                    />

                    <input
                      className={inputClass}
                      placeholder="Share slug (your link) e.g. aparna"
                      value={shareSlug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setShareSlug(e.target.value);
                      }}
                      required
                      name="share_slug__manual"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      inputMode="text"
                    />

                    <div className="text-xs">
                      {slugStatus === "idle" ? (
                        <span className="text-white/45">Pick a unique link.</span>
                      ) : slugStatus === "invalid" ? (
                        <span className="text-red-300">Slug must be at least 3 characters.</span>
                      ) : slugStatus === "checking" ? (
                        <span className="text-white/45">Checking…</span>
                      ) : slugStatus === "taken" ? (
                        <span className="text-red-300">This slug is already taken.</span>
                      ) : (
                        <span className="text-green-300">Available ✓</span>
                      )}
                      {normalizedSlug ? <span className="ml-2 text-white/45">Preview: /{normalizedSlug}</span> : null}
                    </div>

                    <input
                      className={inputClass}
                      placeholder="Tagline (optional)"
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      name="tagline"
                      autoComplete="off"
                    />

                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="text-xs text-white/70">Home location</div>
                      <div className="mt-2">
                        <LocationInput
                          value={{ city: homeCity, region: homeRegion }}
                          onChange={(city: string, region: string) => {
                            setHomeCity(city);
                            setHomeRegion(region);
                          }}
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="text-xs text-white/70">Profile photo (optional)</div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-white/5">
                          {avatarPreview ? (
                            <Image src={avatarPreview} alt="avatar" fill className="object-cover" />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-[10px] text-white/40">—</div>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                          className="text-xs text-white/70"
                        />
                      </div>
                    </div>

                    <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-white/80">
                      <span>Public profile</span>
                      <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                    </label>
                  </>
                ) : null}

                {/* STEP 3 — redesigned */}
                {step === 3 ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">Your memories</div>
                        <div className="text-xs text-white/60">
                          Add up to {MAX_MEMORIES}. Required: location + title + photo.
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={addMemory}
                        disabled={loading || memories.length >= MAX_MEMORIES}
                        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15 disabled:opacity-50"
                      >
                        <Plus size={14} />
                        Add
                      </button>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                      <div className="text-xs text-white/60">
                        {memories.length}/{MAX_MEMORIES} memories
                      </div>
                      <div className="text-xs text-white/60">
                        {canFinish() ? (
                          <span className="text-green-300">Ready to create ✓</span>
                        ) : (
                          <span className="text-white/45">Complete all required fields</span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3">
                      {memories.map((m, idx) => (
                        <MemoryCardV2
                          key={m.key}
                          idx={idx}
                          memory={m}
                          disabled={loading}
                          canRemove={memories.length > 1}
                          open={openKey === m.key}
                          setOpen={() => setOpenKey((cur) => (cur === m.key ? null : m.key))}
                          registerEl={(el) => {
                            memoryCardRefs.current[m.key] = el;
                          }}
                          onRemove={() => removeMemory(m.key)}
                          onUpdate={(patch) => updateMemory(m.key, patch)}
                        />
                      ))}
                    </div>

                    <div className="text-center text-[11px] text-white/45">
                      Tip: Keep cards collapsed while adding many memories — no layout chaos.
                    </div>
                  </>
                ) : null}

                {error ? (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {error}
                  </div>
                ) : null}

                {/* Actions */}
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-4">
                  <button type="button" className={ghostBtn} onClick={handleBack} disabled={!canGoBackToPrevStep}>
                    <ArrowLeft size={16} />
                    Back
                  </button>

                  {step < 3 ? (
                    <button
                      type="button"
                      className={softBtn}
                      disabled={loading || !canGoNext()}
                      onClick={() => {
                        if (step === 1) handleCreateAccount();
                        else handleSaveProfileAndNext();
                      }}
                    >
                      {loading ? <Loader2 className="animate-spin" size={16} /> : null}
                      Next
                      <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button type="submit" className={primaryBtn} disabled={loading || !canFinish()}>
                      {loading ? <Loader2 className="animate-spin" size={16} /> : null}
                      Create my map
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="mx-auto mt-4 text-center text-xs text-white/50">
              Already have an account?{" "}
              <button className="underline hover:text-white" onClick={() => router.push("/")}>
                Go back
              </button>
            </div>
          </div>

          {/* Marketing panel */}
          <div className="order-2 md:order-1">
            <h1 className="text-balance text-3xl font-semibold leading-[0.98] tracking-tight sm:text-4xl md:text-5xl">
              Create your map,
              <br />
              one memory at a time
            </h1>

            <p className="mt-5 max-w-md text-pretty text-sm leading-6 text-white/70 sm:text-base">
              Set up a profile, choose a clean share link, then pin your first moments to places. Keep it private or
              share it when you’re ready.
            </p>

            <ul className="mt-6 grid max-w-md gap-3 text-sm text-white/75">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                  <Check size={16} />
                </span>
                <div>
                  <div className="font-semibold text-white">3 quick steps</div>
                  <div className="text-white/60">Account → Profile → Memories.</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                  <Check size={16} />
                </span>
                <div>
                  <div className="font-semibold text-white">One link</div>
                  <div className="text-white/60">Your map lives at /{normalizedSlug || "yourname"}.</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                  <Check size={16} />
                </span>
                <div>
                  <div className="font-semibold text-white">Photos + notes</div>
                  <div className="text-white/60">Fast to add, easy to remember later.</div>
                </div>
              </li>
            </ul>

            <div className="mt-7 flex flex-wrap items-center gap-2 text-xs text-white/55">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Early access</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Public or private</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">One photo per memory</span>
            </div>
          </div>
        </section>

        <footer className="pb-6 text-xs text-white/40">© {new Date().getFullYear()} worldmap</footer>
      </div>
    </main>
  );
}

function MemoryCardV2({
  idx,
  memory,
  disabled,
  canRemove,
  open,
  setOpen,
  registerEl,
  onUpdate,
  onRemove,
}: {
  idx: number;
  memory: MemoryDraft;
  disabled: boolean;
  canRemove: boolean;
  open: boolean;
  setOpen: () => void;
  registerEl: (el: HTMLDivElement | null) => void;
  onUpdate: (patch: Partial<MemoryDraft>) => void;
  onRemove: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!memory.file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(memory.file);
    setPreviewUrl(url);
    return () => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    };
  }, [memory.file]);

  const hasBasics = !!memory.city.trim() && !!memory.region.trim() && !!memory.description.trim();
  const hasPhoto = !!memory.file;
  const complete = hasBasics && hasPhoto;

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-white/20 focus:bg-black/35";

  return (
    <div ref={registerEl} className="rounded-2xl border border-white/10 bg-black/30">
      {/* Header row */}
      <button
        type="button"
        onClick={setOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">Memory {idx + 1}</div>
            {complete ? (
              <span className="rounded-full border border-green-400/30 bg-green-400/10 px-2 py-0.5 text-[11px] text-green-200">
                Complete
              </span>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/60">
                In progress
              </span>
            )}
          </div>

          <div className="mt-1 truncate text-[11px] text-white/55">
            {memory.description?.trim()
              ? memory.description.trim()
              : "Add a title"}{" "}
            •{" "}
            {memory.city?.trim() && memory.region?.trim()
              ? `${memory.city.trim()}, ${memory.region.trim()}`
              : "Pick a location"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-white/50">{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
        </div>
      </button>

      {/* Body */}
      {open ? (
        <div className="grid gap-3 border-t border-white/10 px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-white/70">Details</div>

            <button
              type="button"
              onClick={onRemove}
              disabled={disabled || !canRemove}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-transparent px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
            >
              <Trash2 size={14} />
              Remove
            </button>
          </div>

          <LocationInput
            value={{ city: memory.city, region: memory.region }}
            onChange={(city: string, region: string) => onUpdate({ city, region })}
          />

          <input
            className={inputClass}
            type="datetime-local"
            value={memory.dateLocal}
            onChange={(e) => onUpdate({ dateLocal: e.target.value })}
          />

          <input
            className={inputClass}
            placeholder="Short description / title (required)"
            value={memory.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
          />

          <textarea
            className={cn("min-h-[90px]", inputClass)}
            placeholder="Write a note (optional)"
            value={memory.note}
            onChange={(e) => onUpdate({ note: e.target.value })}
          />

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="text-xs text-white/70">Photo (required)</div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onUpdate({ file: e.target.files?.[0] ?? null })}
                className="text-xs text-white/70"
              />
              {!previewUrl ? <div className="text-xs text-red-200/80">Choose a photo to continue.</div> : null}
            </div>

            {previewUrl ? (
              <div className="mt-3">
                <div className="relative aspect-square w-28 overflow-hidden rounded-xl border border-white/10">
                  <Image src={previewUrl} alt={`mem-${idx}`} fill className="object-cover" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
