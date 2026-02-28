"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Plus, Image as ImageIcon, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import LocationInput, { type LocationValue } from "./LocationInput";

type Mode = "dark" | "light";

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

function makeLabel(loc: LocationValue) {
  const parts = [loc.city, loc.region, loc.country].filter(Boolean).map((x) => x.trim());
  return parts.join(", ");
}

function normalizePlaceKey(city?: string, region?: string, country?: string) {
  return [city, region, country]
    .filter(Boolean)
    .map((s) => (s || "").trim().toLowerCase())
    .join("|");
}

function getErrorMessage(err: unknown, fallback: string) {
  if (typeof err === "object" && err !== null && "message" in err) {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
  }
  return fallback;
}

const EMPTY_LOC: LocationValue = {
  city: "",
  region: "",
  country: "",
  country_code: null,
  lat: null,
  lng: null,
  place_name: "",
};

type MemoryForEdit = {
  id: string;
  location: LocationValue;
  description?: string | null;
  note?: string | null;
  happened_at?: string | null;
};

function toDateTimeLocal(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export default function AddMemoryModal({
  ownerId,
  mode = "dark",
  open,
  onClose,
  onCreated,
  onSaved,
  onSelectCreatedPin,
  memoryToEdit,
}: {
  ownerId: string;
  mode?: Mode;
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  onSaved?: (placeId: string) => void;
  onSelectCreatedPin?: (placeId: string) => void;
  memoryToEdit?: MemoryForEdit | null;
}) {
  const isLight = mode === "light";

  const shellTheme = isLight
    ? "border-black/10 bg-white/80 text-black"
    : "border-white/10 bg-zinc-950/80 text-white";

  const pillBtn = isLight
    ? "border-black/10 bg-black/[0.04] text-black hover:bg-black/[0.06]"
    : "border-white/10 bg-white/10 text-white hover:bg-white/15";

  const inputTheme = isLight
    ? "border-black/10 bg-black/[0.03] text-black placeholder:text-black/40"
    : "border-white/10 bg-white/5 text-white placeholder:text-white/40";

  const [loc, setLoc] = useState<LocationValue>(EMPTY_LOC);
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [happenedAt, setHappenedAt] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEditing = Boolean(memoryToEdit?.id);

  useEffect(() => {
    if (!open) return;
    if (memoryToEdit) {
      setLoc(memoryToEdit.location);
      setDescription(memoryToEdit.description ?? "");
      setNote(memoryToEdit.note ?? "");
      setHappenedAt(toDateTimeLocal(memoryToEdit.happened_at));
      setFile(null);
      setErr(null);
      return;
    }

    setLoc(EMPTY_LOC);
    setDescription("");
    setNote("");
    setHappenedAt("");
    setFile(null);
    setErr(null);
  }, [open, memoryToEdit]);

  const canSubmit = useMemo(() => {
    const hasLoc = Boolean(loc.city.trim() || loc.region.trim() || loc.country.trim());
    const hasText = description.trim().length > 0 || note.trim().length > 0;
    return Boolean(ownerId && hasLoc && (hasText || file || isEditing));
  }, [ownerId, loc, description, note, file, isEditing]);

  async function uploadMedia(memoryId: string, f: File) {
    const ext = f.name.split(".").pop() || "jpg";
    const path = `${ownerId}/${memoryId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage.from("memory-media").upload(path, f, {
      cacheControl: "3600",
      upsert: false,
    });
    if (upErr) throw upErr;

    const { error: insertErr } = await supabase.from("memory_media").insert({
      memory_id: memoryId,
      storage_path: path,
      // Keep consistent with signup flow + DB constraint (expects normalized type, not MIME).
      media_type: "image",
      sort_order: 0,
      taken_at: new Date().toISOString(),
      width: null,
      height: null,
    });
    if (insertErr) throw insertErr;
  }

  async function ensurePlace(location: LocationValue): Promise<string> {
    const normalized_key = normalizePlaceKey(location.city, location.region, location.country);

    // 1) Try find
    const { data: existing, error: findErr } = await supabase
      .from("places")
      .select("id, lat, lng")
      .eq("normalized_key", normalized_key)
      .maybeSingle();

    if (findErr) throw findErr;
    if (existing?.id) {
      const missingCoords = existing.lat == null || existing.lng == null;
      const hasCoords = location.lat != null && location.lng != null;
      if (missingCoords && hasCoords) {
        const { error: updateErr } = await supabase
          .from("places")
          .update({
            lat: location.lat,
            lng: location.lng,
            country_code: location.country_code,
          })
          .eq("id", existing.id);
        if (updateErr) throw updateErr;
      }
      return existing.id;
    }

    // 2) Create
    const { data: created, error: createErr } = await supabase
      .from("places")
      .insert({
        city: location.city.trim() || null,
        region: location.region.trim() || null,
        country: location.country.trim() || null,
        country_code: location.country_code,
        lat: location.lat,
        lng: location.lng,
        normalized_key,
      })
      .select("id")
      .single();

    // If you add a UNIQUE constraint on normalized_key, two users could race.
    // In that case, insert might fail—so we re-select.
    if (createErr) {
      // Try re-select once in case it already got created
      const { data: retry, error: retryErr } = await supabase
        .from("places")
        .select("id")
        .eq("normalized_key", normalized_key)
        .maybeSingle();

      if (retryErr) throw createErr;
      if (retry?.id) return retry.id;

      throw createErr;
    }

    return created.id;
  }

  async function ensureUserPin(userId: string, placeId: string, label: string) {
    const { error } = await supabase
      .from("user_places")
      .upsert(
        {
          user_id: userId,
          place_id: placeId,
          label: label || null,
          pinned: true,
        },
        { onConflict: "user_id,place_id" }
      );

    if (error) throw error;
  }

  async function replaceMedia(memoryId: string, nextFile: File) {
    const { data: oldMedia, error: oldMediaErr } = await supabase
      .from("memory_media")
      .select("id, storage_path")
      .eq("memory_id", memoryId);
    if (oldMediaErr) throw oldMediaErr;

    const oldPaths = (oldMedia ?? [])
      .map((row) => row.storage_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);

    if (oldPaths.length) {
      const { error: removeErr } = await supabase.storage.from("memory-media").remove(oldPaths);
      if (removeErr) throw removeErr;
    }

    const { error: deleteRowsErr } = await supabase.from("memory_media").delete().eq("memory_id", memoryId);
    if (deleteRowsErr) throw deleteRowsErr;

    await uploadMedia(memoryId, nextFile);
  }

  async function submitMemory() {
    if (!ownerId) return;

    // Guard: make sure we have a real selection
    if (!loc.city.trim() && !loc.region.trim() && !loc.country.trim()) {
      setErr("Please choose a valid location");
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      const label = makeLabel(loc) || loc.place_name || "Pinned place";
      const placeId = await ensurePlace(loc);

      // pin it
      await ensureUserPin(ownerId, placeId, label);

      if (isEditing && memoryToEdit?.id) {
        const { error: updErr } = await supabase
          .from("memories")
          .update({
            place_id: placeId,
            description: description.trim() || null,
            note: note.trim() || null,
            happened_at: happenedAt ? new Date(happenedAt).toISOString() : null,
          })
          .eq("id", memoryToEdit.id)
          .eq("user_id", ownerId);

        if (updErr) throw updErr;

        if (file) await replaceMedia(memoryToEdit.id, file);
      } else {
        const { data: mem, error: memErr } = await supabase
          .from("memories")
          .insert({
            user_id: ownerId,
            place_id: placeId,
            description: description.trim() || null,
            note: note.trim() || null,
            happened_at: happenedAt ? new Date(happenedAt).toISOString() : null,
            // visibility: "public" / "private" (optional)
          })
          .select("id")
          .single();

        if (memErr) throw memErr;

        if (file) {
          await uploadMedia(mem.id, file);
        }
      }

      onSaved?.(placeId);
      onCreated?.();
      onSelectCreatedPin?.(placeId);
      onClose();
    } catch (e: unknown) {
      console.warn(e);
      setErr(getErrorMessage(e, isEditing ? "Failed to update memory" : "Failed to create memory"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <div
        className={cx("w-full max-w-lg overflow-hidden rounded-[26px] border shadow-2xl backdrop-blur", shellTheme)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <MapPin size={16} className={isLight ? "text-black/70" : "text-white/80"} />
            <div className="text-sm font-semibold">{isEditing ? "Edit memory" : "Add a memory"}</div>
          </div>
          <button onClick={onClose} className={cx("rounded-full border px-2.5 py-1.5", pillBtn)} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5">
          {/* Location */}
          <div className="mb-3">
            <div className={cx("mb-1 text-xs", isLight ? "text-black/60" : "text-white/60")}>Location</div>
            <LocationInput
              value={loc}
              required
              onChange={(next) => setLoc(next)}
              placeholder="Search a city…"
            />
          </div>

          <div className="grid gap-3">
            <div>
              <div className={cx("mb-1 text-xs", isLight ? "text-black/60" : "text-white/60")}>Caption</div>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={cx("w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputTheme)}
                placeholder="Short description (e.g., Coffee + thrift)"
              />
            </div>

            <div>
              <div className={cx("mb-1 text-xs", isLight ? "text-black/60" : "text-white/60")}>Note (optional)</div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={cx("min-h-[88px] w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputTheme)}
                placeholder="Anything you want to remember…"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className={cx("mb-1 text-xs", isLight ? "text-black/60" : "text-white/60")}>When (optional)</div>
                <input
                  type="datetime-local"
                  value={happenedAt}
                  onChange={(e) => setHappenedAt(e.target.value)}
                  className={cx("w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputTheme)}
                />
              </div>

              <div>
                <div className={cx("mb-1 text-xs", isLight ? "text-black/60" : "text-white/60")}>Photo (optional)</div>
                <label
                  className={cx(
                    "flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 text-sm",
                    inputTheme
                  )}
                >
                  <span className={cx("inline-flex items-center gap-2", isLight ? "text-black/70" : "text-white/70")}>
                    <ImageIcon size={16} />
                    {file ? file.name : "Choose file"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>

            {err ? (
              <div
                className={cx(
                  "rounded-2xl border px-4 py-3 text-xs",
                  isLight
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-red-500/20 bg-red-500/10 text-red-200"
                )}
              >
                {err}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={onClose} className={cx("rounded-full border px-4 py-2 text-xs font-semibold", pillBtn)}>
              Cancel
            </button>

            <button
              disabled={!canSubmit || busy}
              onClick={submitMemory}
              className={cx(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold",
                isLight ? "bg-black text-white" : "bg-white text-black",
                (!canSubmit || busy) ? "opacity-50" : "hover:opacity-90"
              )}
            >
              <Plus size={16} />
              {busy ? "Saving…" : isEditing ? "Save changes" : "Add memory"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
