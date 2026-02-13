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
  ChevronLeft,
  ChevronRight,
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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

type MemoryDraft = {
  key: string;
  city: string;
  region: string;
  note: string;
  dateLocal: string; // datetime-local
  file: File | null; // ONE photo per memory
};

const MAX_MEMORIES = 10; // UI text still says 1–5; set to 5 if you want hard limit

const headlineClass =
  "text-balance text-3xl font-semibold leading-[0.98] tracking-tight sm:text-4xl md:text-5xl";

function StepMeta(step: Step) {
  if (step === 1) return { title: "Create your account", desc: "Start with email + password." };
  if (step === 2) return { title: "Set up your profile", desc: "Pick a link, add a home city, optional photo." };
  return { title: "Add your first memories", desc: "Add 1–5 memories. Each needs a location + one photo." };
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function SignupOnboardingPage() {
  const router = useRouter();
  const cardScrollRef = useRef<HTMLDivElement | null>(null);

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
  const [tagline, setTagline] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [homeRegion, setHomeRegion] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Step 3: memories (stacked card carousel)
  const [memories, setMemories] = useState<MemoryDraft[]>(() => [
    {
      key: crypto.randomUUID(),
      city: "",
      region: "",
      note: "",
      dateLocal: makeLocalDateTimeValue(new Date()),
      file: null,
    },
  ]);
  const [activeIdx, setActiveIdx] = useState(0);

  // Slug availability
  const normalizedSlug = useMemo(() => normalizeSlug(shareSlug), [shareSlug]);
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");

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

  // Check slug
  useEffect(() => {
    let cancelled = false;

    async function checkSlug() {
      if (!shareSlug.trim()) {
        setSlugStatus("idle");
        return;
      }
      if (!normalizedSlug || normalizedSlug.length < 3) {
        setSlugStatus("invalid");
        return;
      }

      setSlugStatus("checking");
      await new Promise((r) => setTimeout(r, 300));
      if (cancelled) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("share_slug", normalizedSlug)
        .limit(1);

      if (cancelled) return;

      if (error) {
        console.warn("[slug-check] error:", error);
        // Don't block signup if read is temporarily restricted.
        setSlugStatus("available");
        return;
      }

      setSlugStatus(data && data.length > 0 ? "taken" : "available");
    }

    checkSlug();
    return () => {
      cancelled = true;
    };
  }, [shareSlug, normalizedSlug]);

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

    // Require every memory to be valid: location + 1 photo
    for (const m of memories) {
      if (!m.city.trim() || !m.region.trim()) return false;
      if (!m.file) return false;
    }
    return true;
  }

  async function uploadWithLogs(bucket: string, path: string, file: File) {
    const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });

    console.log(`[storage upload] bucket=${bucket} path=${path}`, {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      data,
      error,
    });

    if (error) throw error;

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    console.log(`[storage public url] bucket=${bucket} path=${path}`, pub);
    return pub.publicUrl;
  }

  async function ensurePlace(city: string, region: string, country = "United States") {
    const normalized_key = normalizePlaceKey(city, region, country);

    console.log("[ensurePlace] start", { city, region, country, normalized_key });

    const found = await supabase
      .from("places")
      .select("id")
      .eq("normalized_key", normalized_key)
      .maybeSingle();

    console.log("[ensurePlace] found", { data: found.data, error: found.error });

    if (found.error) throw found.error;
    if (found.data?.id) return found.data.id as string;

    const inserted = await supabase
      .from("places")
      .insert([{ city, region, country, normalized_key }])
      .select("id")
      .single();

    console.log("[ensurePlace] inserted", { data: inserted.data, error: inserted.error });

    if (inserted.error) throw inserted.error;
    return inserted.data.id as string;
  }

  // STEP 1: create auth user + session
  async function handleCreateAccount() {
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      console.group("[onboarding] STEP 1: create account");
      console.log("signUp payload", { email });

      const { data, error } = await supabase.auth.signUp({ email, password });
      console.log("signUp result", { data, error });

      if (error) throw error;

      let userId = data.user?.id ?? null;

      // Fallback sign-in
      if (!userId) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        console.log("signInWithPassword fallback", { signInData, signInErr });

        if (signInErr) throw signInErr;
        userId = signInData.user?.id ?? null;
      }

      if (!userId) throw new Error("Could not create session after signup.");

      console.log("✅ session user id", userId);
      setUid(userId);
      setStep(2);
    } catch (e: any) {
      console.error("[signup-step1] error:", e);
      setError(e?.message ?? "Signup failed.");
    } finally {
      console.groupEnd();
      setLoading(false);
    }
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
      console.group("[onboarding] STEP 2: save profile");

      let avatarUrl: string | undefined = undefined;

      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop() || "jpg";
        const path = `${uid}/avatar.${ext}`;

        console.log("Uploading avatar…", { bucket: "avatars", path });
        avatarUrl = await uploadWithLogs("avatars", path, avatarFile);
      } else {
        console.log("No avatar selected.");
      }

      console.log("Upserting profile…", {
        uid,
        full_name: fullName,
        share_slug: normalizedSlug,
        is_public: isPublic,
        avatar_url: avatarUrl,
      });

      const { error: profErr } = await upsertProfile(uid, {
        full_name: fullName,
        avatar_url: avatarUrl,
        tagline,
        home_city: homeCity,
        home_region: homeRegion,
        is_public: isPublic,
        share_slug: normalizedSlug,
      });

      console.log("upsertProfile result", { profErr });

      if (profErr) {
        const msg = (profErr as any)?.message ?? "Failed to create profile.";
        if (msg.toLowerCase().includes("share_slug") || msg.toLowerCase().includes("duplicate")) {
          setError("This slug is already taken. Try a different one.");
        } else {
          setError(msg);
        }
        return;
      }

      console.log("✅ profile saved, moving to step 3");
      setStep(3);
    } catch (e: any) {
      console.error("[signup-step2] error:", e);
      setError(e?.message ?? "Failed to save profile.");
    } finally {
      console.groupEnd();
      setLoading(false);
    }
  }

  // STEP 3: create N memories (each with 1 photo)
  async function handleFinish(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);

    if (!uid) {
      setError("No session found. Please create your account first.");
      return;
    }

    if (!canFinish()) {
      setError("Add 1–5 memories. Each memory needs a location + exactly 1 photo.");
      return;
    }

    setLoading(true);

    try {
      console.group("[onboarding] STEP 3: create memories");

      for (let i = 0; i < memories.length; i++) {
        const m = memories[i];

        console.group(`[memory ${i + 1}/${memories.length}]`);

        const city = m.city.trim();
        const region = m.region.trim();
        const happened_at = new Date(m.dateLocal).toISOString();

        console.log("memory draft", {
          city,
          region,
          note: m.note,
          happened_at,
          file: m.file ? { name: m.file.name, type: m.file.type, size: m.file.size } : null,
        });

        // 1) place
        const placeId = await ensurePlace(city, region, "United States");

        // 2) pin (user_places)
        const pinLabel = `${city} Trip`;
        const upsertPin = await supabase
          .from("user_places")
          .upsert(
            [
              {
                user_id: uid,
                place_id: placeId,
                label: pinLabel,
                pinned: true,
              },
            ],
            { onConflict: "user_id,place_id" as any },
          );

        console.log("user_places upsert", { data: upsertPin.data, error: upsertPin.error });
        if (upsertPin.error) throw upsertPin.error;

        // 3) memory row
        const memInsert = await supabase
          .from("memories")
          .insert([
            {
              user_id: uid,
              place_id: placeId,
              note: m.note || null,
              happened_at,
              visibility: isPublic ? "public" : "private",
            },
          ])
          .select("id")
          .single();

        console.log("memories insert", { data: memInsert.data, error: memInsert.error });
        if (memInsert.error) throw memInsert.error;

        const memoryId = memInsert.data.id as string;

        // 4) upload ONE photo + insert memory_media
        const file = m.file!;
        const ext = file.name.split(".").pop() || "jpg";
        const storage_path = `${uid}/${memoryId}/0.${ext}`;

        console.log("Uploading memory photo…", { bucket: "memory-media", storage_path });

        const uploadRes = await supabase.storage.from("memory-media").upload(storage_path, file, {
          upsert: true,
          contentType: file.type || "application/octet-stream",
        });

        console.log("[storage upload] memory-media", { data: uploadRes.data, error: uploadRes.error });
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

        console.log("memory_media insert", { data: mediaRow.data, error: mediaRow.error });
        if (mediaRow.error) throw mediaRow.error;

        console.log("✅ memory created", { memoryId, placeId, pinLabel });
        console.groupEnd();
      }

      console.log("✅ all memories created. redirecting…", `/${normalizedSlug}`);
      router.push(`/${normalizedSlug}`);
    } catch (err: any) {
      console.error("[onboarding] error:", err);
      setError(err?.message ?? "Something went wrong creating your memories.");
    } finally {
      console.groupEnd();
      setLoading(false);
    }
  }

  // Step 3 helpers
  function updateMemory(key: string, patch: Partial<MemoryDraft>) {
    setMemories((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }

  function addMemory() {
    setError(null);
    setMemories((prev) => {
      if (prev.length >= MAX_MEMORIES) return prev;
      const next = [
        ...prev,
        {
          key: crypto.randomUUID(),
          city: "",
          region: "",
          note: "",
          dateLocal: makeLocalDateTimeValue(new Date()),
          file: null,
        },
      ];
      return next;
    });

    setActiveIdx((i) => Math.min(i + 1, MAX_MEMORIES - 1));

    requestAnimationFrame(() => {
      cardScrollRef.current?.scrollTo({
        left: cardScrollRef.current.scrollWidth,
        behavior: "smooth",
      });
    });
  }

  function removeMemory(key: string) {
    setError(null);
    setMemories((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((m) => m.key === key);
      const next = prev.filter((m) => m.key !== key);
      setActiveIdx((cur) => {
        if (cur > next.length - 1) return next.length - 1;
        if (idx >= 0 && idx < cur) return Math.max(0, cur - 1);
        if (idx === cur) return Math.min(cur, next.length - 1);
        return cur;
      });
      return next;
    });

    requestAnimationFrame(() => {
      cardScrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
    });
  }

  function goToIdx(nextIdx: number) {
    setActiveIdx(() => {
      const clamped = Math.max(0, Math.min(nextIdx, memories.length - 1));
      requestAnimationFrame(() => {
        const el = document.getElementById(`mem-card-${clamped}`);
        el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      });
      return clamped;
    });
  }

  const meta = StepMeta(step);

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-white/20 focus:bg-black/35";

  const primaryBtn =
    "inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50";
  const softBtn =
    "inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-5 py-3 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50";
  const ghostBtn =
    "inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-transparent px-5 py-3 text-xs font-semibold text-white/75 hover:bg-white/5 disabled:opacity-50";

  return (
    <main className="min-h-[100svh] w-full bg-black text-white">
      {/* Background (match main page vibe) */}
      <div className="fixed inset-0 -z-10">
        <MapboxMap />
        <div className="absolute inset-0 bg-black/80" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_30%,rgba(255,255,255,0.10),transparent_44%),radial-gradient(circle_at_70%_60%,rgba(255,255,255,0.06),transparent_55%)]" />
      </div>

      <div className="mx-auto flex min-h-[100svh] max-w-7xl flex-col px-5 sm:px-6">
        {/* Top nav (like main page) */}
        <header className="flex items-center justify-between py-5 sm:py-6">
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

        {/* Content: left = info, right = onboarding card */}
        <section className="grid flex-1 items-start gap-10 pb-10 pt-2 sm:pt-6 md:grid-cols-2 md:gap-16 lg:gap-24">
          {/* LEFT: marketing-ish panel to match main page quality */}
          <div className="pt-2 sm:pt-6 md:pt-10">
            <h1 className={headlineClass}>
              Create your map,
              <br />
              one memory at a time
            </h1>

            <p className="mt-5 max-w-md text-pretty text-sm leading-6 text-white/70 sm:text-base">
              Set up a profile, choose a clean share link, then pin your first moments to places.
              Keep it private or share it when you’re ready.
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
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                Early access
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                Public or private
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                One photo per memory
              </span>
            </div>
          </div>

          {/* RIGHT: onboarding card */}
          <div className="w-full pt-0 sm:pt-2 md:pt-10">
            <div className="mx-auto w-full max-w-xl overflow-hidden rounded-[28px] border border-white/10 bg-black/55 shadow-2xl backdrop-blur">
              {/* Header */}
              <div className="border-b border-white/10 p-5 md:p-7">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-white/60">Step {step} of 3</div>

                  <div className="flex items-center gap-2 text-xs text-white/60">
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

                <h2 className="mt-3 text-xl font-semibold tracking-tight md:text-2xl">
                  {meta.title}
                </h2>
                <p className="mt-2 text-sm text-white/65">{meta.desc}</p>
              </div>

              {/* Form body */}
              <form className="grid gap-3 p-5 md:p-7" onSubmit={handleFinish}>
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
                    />
                    <input
                      className={inputClass}
                      placeholder="Password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                    <div className="text-xs text-white/55">
                      You’ll create your account first, then upload your profile photo + memories.
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
                    />

                    <input
                      className={inputClass}
                      placeholder="Share slug (your link) e.g. aparna"
                      value={shareSlug}
                      onChange={(e) => setShareSlug(e.target.value)}
                      required
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
                      {normalizedSlug ? (
                        <span className="ml-2 text-white/45">Preview: /{normalizedSlug}</span>
                      ) : null}
                    </div>

                    <input
                      className={inputClass}
                      placeholder="Tagline (optional)"
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
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
                      <div className="mt-3 flex items-center gap-3">
                        <div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-white/5">
                          {avatarPreview ? (
                            <Image src={avatarPreview} alt="avatar" fill className="object-cover" />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-[10px] text-white/40">
                              —
                            </div>
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
                      <input
                        type="checkbox"
                        checked={isPublic}
                        onChange={(e) => setIsPublic(e.target.checked)}
                      />
                    </label>
                  </>
                ) : null}

                {/* STEP 3 */}
                {step === 3 ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">Add memories</div>
                        <div className="text-xs text-white/60">
                          Add 1–5 memories. Each memory needs a location + 1 photo.
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

                    {/* Quick nav */}
                    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => goToIdx(activeIdx - 1)}
                        disabled={activeIdx <= 0}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-transparent px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
                        title="Previous memory"
                      >
                        <ChevronLeft size={16} />
                        Prev
                      </button>

                      <div className="text-xs text-white/60">
                        Memory <span className="text-white">{activeIdx + 1}</span> / {memories.length}
                      </div>

                      <button
                        type="button"
                        onClick={() => goToIdx(activeIdx + 1)}
                        disabled={activeIdx >= memories.length - 1}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-transparent px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
                        title="Next memory"
                      >
                        Next
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    {/* Rail wrapper with subtle edge fades */}
                    <div className="relative">
                      <div className="pointer-events-none absolute left-0 top-0 h-full w-10 bg-gradient-to-r from-black/60 to-transparent" />
                      <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-black/60 to-transparent" />

                      <div
                        ref={cardScrollRef}
                        className={cn(
                          "mt-1 flex gap-3 overflow-x-auto pb-2",
                          "snap-x snap-mandatory",
                          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                        )}
                      >
                        {memories.map((m, idx) => (
                          <MemoryCard
                            key={m.key}
                            id={`mem-card-${idx}`}
                            idx={idx}
                            active={idx === activeIdx}
                            disabled={loading}
                            canRemove={memories.length > 1}
                            memory={m}
                            onFocus={() => setActiveIdx(idx)}
                            onRemove={() => removeMemory(m.key)}
                            onUpdate={(patch) => updateMemory(m.key, patch)}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Dots */}
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      {memories.map((m, idx) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => goToIdx(idx)}
                          className={cn(
                            "h-2.5 w-2.5 rounded-full border border-white/20 transition",
                            idx === activeIdx ? "bg-white/80" : "bg-white/10 hover:bg-white/20",
                          )}
                          aria-label={`Go to memory ${idx + 1}`}
                          title={`Memory ${idx + 1}`}
                        />
                      ))}
                    </div>

                    <div className="text-center text-xs text-white/50">
                      {memories.length}/{MAX_MEMORIES} memories
                    </div>
                  </>
                ) : null}

                {error ? (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {error}
                  </div>
                ) : null}

                {/* Actions (sticky-ish within card) */}
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-4">
                  <button
                    type="button"
                    className={ghostBtn}
                    onClick={() => setStep((s) => (s === 1 ? 1 : ((s - 1) as Step)))}
                    disabled={loading || step === 1}
                  >
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
        </section>

        <footer className="pb-6 text-xs text-white/40">© {new Date().getFullYear()} worldmap</footer>
      </div>
    </main>
  );
}

function MemoryCard({
  id,
  idx,
  active,
  disabled,
  canRemove,
  memory,
  onUpdate,
  onRemove,
  onFocus,
}: {
  id: string;
  idx: number;
  active: boolean;
  disabled: boolean;
  canRemove: boolean;
  memory: MemoryDraft;
  onUpdate: (patch: Partial<MemoryDraft>) => void;
  onRemove: () => void;
  onFocus: () => void;
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

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-white/20 focus:bg-black/35";

  return (
    <div
      id={id}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      className={[
        "min-w-[92%] sm:min-w-[540px] snap-start",
        "rounded-2xl border bg-black/30 p-4 shadow-lg transition",
        active ? "border-white/30" : "border-white/10 hover:border-white/20",
      ].join(" ")}
      style={{ scrollSnapAlign: "start" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-white/70">Memory {idx + 1}</div>

        <button
          type="button"
          onClick={onRemove}
          disabled={disabled || !canRemove}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-transparent px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
          title="Remove this memory"
        >
          <Trash2 size={14} />
          <span className="hidden sm:inline">Remove</span>
        </button>
      </div>

      <LocationInput
        value={{ city: memory.city, region: memory.region }}
        onChange={(city: string, region: string) => onUpdate({ city, region })}
      />

      <input
        className={`mt-2 ${inputClass}`}
        type="datetime-local"
        value={memory.dateLocal}
        onChange={(e) => onUpdate({ dateLocal: e.target.value })}
      />

      <textarea
        className={`mt-2 ${inputClass} min-h-[90px]`}
        placeholder="Write a note (optional)"
        value={memory.note}
        onChange={(e) => onUpdate({ note: e.target.value })}
      />

      <div className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="text-xs text-white/70">Photo (required)</div>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onUpdate({ file: e.target.files?.[0] ?? null })}
            className="text-xs text-white/70"
          />

          {!previewUrl ? (
            <div className="text-xs text-red-200/80">Choose a photo to continue.</div>
          ) : null}
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
  );
}
