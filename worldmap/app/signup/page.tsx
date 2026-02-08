// app/signup/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2 } from "lucide-react";

import MapboxMap from "@/components/MapboxMap";
import LocationInput from "@/components/LocationInput";
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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type MemoryDraft = {
  key: string;
  city: string;
  region: string;
  note: string;
  dateLocal: string; // datetime-local value
  file: File | null; // ONE photo per memory
};

const MAX_MEMORIES = 5;

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
  const [tagline, setTagline] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [homeRegion, setHomeRegion] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Step 3: memories (1–5), 1 photo per memory
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

  // Slug availability
  const normalizedSlug = useMemo(() => normalizeSlug(shareSlug), [shareSlug]);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");

  // Preview for avatar
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

  // STEP 1 action: create auth user and ensure session exists
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

      // Fallback: sign-in to guarantee session
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

  // STEP 2 action: save profile (+ avatar upload) then move to step 3
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

  // STEP 3 action: create 1–5 memories, each with 1 photo, then redirect
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

        // 2) pin (user_places) — make sure it exists for this place
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
      return [
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
    });
  }

  function removeMemory(key: string) {
    setError(null);
    setMemories((prev) => (prev.length <= 1 ? prev : prev.filter((m) => m.key !== key)));
  }

  return (
    <main className="h-[100svh] w-full bg-black text-white">
      <div className="relative h-full w-full">
        <div className="absolute inset-0">
          <MapboxMap />
          <div className="absolute inset-0 bg-black/60" />
        </div>

        <div className="relative z-10 mx-auto flex h-full max-w-4xl flex-col justify-center px-6">
          <div className="mx-auto w-full max-w-xl rounded-[28px] border border-white/10 bg-black/70 p-5 shadow-2xl backdrop-blur md:p-7">
            <div className="flex items-center justify-between">
              <div className="text-sm text-white/70">Step {step} of 3</div>

              <div className="flex items-center gap-3 text-xs text-white/70">
                <span className={step >= 1 ? "text-white" : ""}>
                  <Check size={14} className="inline" /> Account
                </span>
                <span className={step >= 2 ? "text-white" : ""}>
                  <Check size={14} className="inline" /> Profile
                </span>
                <span className={step >= 3 ? "text-white" : ""}>
                  <Check size={14} className="inline" /> Memories
                </span>
              </div>
            </div>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">Create your map</h1>
            <p className="mt-2 text-sm text-zinc-300">
              Early access: create your account, set up your profile, and add 1–5 memories.
            </p>

            <form className="mt-5 grid gap-3" onSubmit={handleFinish}>
              {/* STEP 1 */}
              {step === 1 ? (
                <>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
                    placeholder="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
                    placeholder="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  <div className="text-xs text-white/60">
                    You’ll create your account first, then upload your profile photo + memories.
                  </div>
                </>
              ) : null}

              {/* STEP 2 */}
              {step === 2 ? (
                <>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
                    placeholder="Full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />

                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
                    placeholder="Share slug (your link) e.g. aparna"
                    value={shareSlug}
                    onChange={(e) => setShareSlug(e.target.value)}
                    required
                  />

                  <div className="text-xs">
                    {slugStatus === "idle" ? (
                      <span className="text-zinc-500">Pick a unique link.</span>
                    ) : slugStatus === "invalid" ? (
                      <span className="text-red-300">Slug must be at least 3 characters.</span>
                    ) : slugStatus === "checking" ? (
                      <span className="text-zinc-400">Checking…</span>
                    ) : slugStatus === "taken" ? (
                      <span className="text-red-300">This slug is already taken.</span>
                    ) : (
                      <span className="text-green-300">Available ✓</span>
                    )}
                    {normalizedSlug ? <span className="ml-2 text-zinc-500">Preview: /{normalizedSlug}</span> : null}
                  </div>

                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
                    placeholder="Tagline (optional)"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                  />

                  <LocationInput
                    value={{ city: homeCity, region: homeRegion }}
                    onChange={(city: string, region: string) => {
                      setHomeCity(city);
                      setHomeRegion(region);
                    }}
                  />

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="text-xs text-white/70">Profile photo (optional)</div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-white/5">
                        {avatarPreview ? <Image src={avatarPreview} alt="avatar" fill className="object-cover" /> : null}
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

              {/* STEP 3 */}
              {step === 3 ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Add memories</div>
                      <div className="text-xs text-white/60">Add 1–5 memories. Each memory needs a location + 1 photo.</div>
                    </div>

                    <button
                      type="button"
                      onClick={addMemory}
                      disabled={loading || memories.length >= MAX_MEMORIES}
                      className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15 disabled:opacity-50"
                    >
                      <Plus size={14} />
                      Add memory
                    </button>
                  </div>

                  <div className="grid gap-3">
                    {memories.map((m, idx) => {
                      const previewUrl = m.file ? URL.createObjectURL(m.file) : null;

                      return (
                        <div key={m.key} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-xs text-white/70">Memory {idx + 1}</div>
                            <button
                              type="button"
                              onClick={() => removeMemory(m.key)}
                              disabled={loading || memories.length <= 1}
                              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-transparent px-2 py-1 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
                              title="Remove this memory"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <LocationInput
                            value={{ city: m.city, region: m.region }}
                            onChange={(city: string, region: string) => updateMemory(m.key, { city, region })}
                          />

                          <input
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
                            type="datetime-local"
                            value={m.dateLocal}
                            onChange={(e) => updateMemory(m.key, { dateLocal: e.target.value })}
                          />

                          <textarea
                            className="mt-2 w-full min-h-[90px] rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
                            placeholder="Write a note (optional)"
                            value={m.note}
                            onChange={(e) => updateMemory(m.key, { note: e.target.value })}
                          />

                          <div className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4">
                            <div className="text-xs text-white/70">Photo (required)</div>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => updateMemory(m.key, { file: e.target.files?.[0] ?? null })}
                              className="mt-2 text-xs text-white/70"
                            />

                            {previewUrl ? (
                              <div className="mt-3">
                                <div className="relative aspect-square w-28 overflow-hidden rounded-xl border border-white/10">
                                  <Image
                                    src={previewUrl}
                                    alt={`mem-${idx}`}
                                    fill
                                    className="object-cover"
                                    onLoadingComplete={() => {
                                      // Revoke after Image has loaded (safe cleanup)
                                      try {
                                        URL.revokeObjectURL(previewUrl);
                                      } catch {}
                                    }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 text-xs text-red-200/80">Choose a photo to continue.</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-xs text-white/50">
                    {memories.length}/{MAX_MEMORIES} memories
                  </div>
                </>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {error}
                </div>
              ) : null}

              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-transparent px-4 py-3 text-xs font-semibold text-white/70 hover:bg-white/5 disabled:opacity-50"
                  onClick={() => setStep((s) => (s === 1 ? 1 : ((s - 1) as Step)))}
                  disabled={loading || step === 1}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>

                {step < 3 ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs font-semibold hover:bg-white/15 disabled:opacity-50"
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
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs font-semibold hover:bg-white/15 disabled:opacity-50"
                    disabled={loading || !canFinish()}
                  >
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
      </div>
    </main>
  );
}
