"use client";

import { useMemo, useState } from "react";
import { Plus, Loader2, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Mode = "dark" | "light";

type GeocodeResult = {
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number;
  lng: number;
};

async function geocodePlace(query: string): Promise<GeocodeResult | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query
  )}.json?types=place,locality,region,country&limit=1&access_token=${token}`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const feat = json?.features?.[0];
  if (!feat?.center?.length) return null;

  const [lng, lat] = feat.center;
  const ctx = [...(feat.context ?? []), feat].filter(Boolean);

  const find = (prefix: string) =>
    ctx.find((c: any) => typeof c.id === "string" && c.id.startsWith(prefix))?.text ?? null;

  const city = find("place") ?? find("locality") ?? feat.text ?? null;
  const region = find("region");
  const country = find("country");

  return { city, region, country, lat, lng };
}

/**
 * Assumes schema:
 * - places(id uuid, city, region, country, lat, lng)
 * - user_places(user_id uuid, place_id uuid, pinned bool, label text)
 *
 * If your columns differ, adjust the select/insert/upsert blocks.
 */
export default function AddPinInline({
  ownerId,
  mode = "dark",
  compact = false,
  onCreated,
}: {
  ownerId: string;
  mode?: Mode;
  compact?: boolean;
  onCreated?: () => void;
}) {
  const isLight = mode === "light";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const btn = isLight
    ? "border-black/10 bg-black/[0.04] text-black hover:bg-black/[0.06]"
    : "border-white/10 bg-white/10 text-white hover:bg-white/15";

  const field = isLight
    ? "border-black/10 bg-white/80 text-black placeholder:text-black/40"
    : "border-white/10 bg-white/5 text-white placeholder:text-white/30";

  const panel = isLight ? "border-black/10 bg-white/80" : "border-white/10 bg-zinc-950/80";

  const canSubmit = useMemo(() => query.trim().length >= 3 && !saving, [query, saving]);

  async function handleCreate() {
    setError(null);
    if (!ownerId) {
      setError("Missing owner id");
      return;
    }

    const q = query.trim();
    if (q.length < 3) return;

    setSaving(true);

    try {
      const geo = await geocodePlace(q);
      if (!geo) {
        throw new Error(
          "Could not find that place. (Set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN.)"
        );
      }

      const city = geo.city;
      const region = geo.region;
      const country = geo.country;

      let placeId: string | null = null;

      const { data: existing, error: existErr } = await supabase
        .from("places")
        .select("id")
        .eq("city", city)
        .eq("region", region)
        .eq("country", country)
        .limit(1);

      if (existErr) throw existErr;

      if (existing?.[0]?.id) {
        placeId = existing[0].id;

        // keep coords updated
        await supabase.from("places").update({ lat: geo.lat, lng: geo.lng }).eq("id", placeId);
      } else {
        const { data: created, error: createErr } = await supabase
          .from("places")
          .insert({ city, region, country, lat: geo.lat, lng: geo.lng })
          .select("id")
          .single();

        if (createErr) throw createErr;
        placeId = created?.id ?? null;
      }

      if (!placeId) throw new Error("Failed to resolve place id");

      const { error: upErr } = await supabase.from("user_places").upsert(
        {
          user_id: ownerId,
          place_id: placeId,
          pinned: true,
          label: label.trim() || null,
        },
        { onConflict: "user_id,place_id" }
      );

      if (upErr) throw upErr;

      setQuery("");
      setLabel("");
      setOpen(false);
      onCreated?.();
    } catch (e: any) {
      setError(e?.message ?? "Failed to add pin");
    } finally {
      setSaving(false);
    }
  }

  if (compact) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${btn}`}
          aria-label="Add pin"
          title="Add pin"
        >
          <Plus size={16} />
        </button>

        {open ? (
          <div className={`absolute right-0 mt-2 w-[280px] rounded-2xl border p-3 shadow-2xl ${panel}`}>
            <div className="text-xs font-semibold opacity-80">Add a pin</div>

            <div className="mt-2 space-y-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="City, State/Country"
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${field}`}
              />
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Optional label (e.g., Home base)"
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${field}`}
              />

              {error ? <div className="text-xs text-red-300">{error}</div> : null}

              <button
                type="button"
                onClick={handleCreate}
                disabled={!canSubmit}
                className={`inline-flex w-full items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold ${btn} disabled:opacity-50`}
              >
                {saving ? (
                  <Loader2 className="mr-2 animate-spin" size={16} />
                ) : (
                  <MapPin className="mr-2" size={16} />
                )}
                Add pin
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // Full = inline card (best for mobile popup)
  return (
    <div className={`rounded-2xl border p-3 ${panel}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold opacity-80">Add a pin</div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold ${btn}`}
        >
          {open ? "Close" : "New"}
        </button>
      </div>

      {open ? (
        <div className="mt-2 space-y-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="City, State/Country"
            className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${field}`}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional label"
            className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${field}`}
          />

          {error ? <div className="text-xs text-red-300">{error}</div> : null}

          <button
            type="button"
            onClick={handleCreate}
            disabled={!canSubmit}
            className={`inline-flex w-full items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold ${btn} disabled:opacity-50`}
          >
            {saving ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Plus className="mr-2" size={16} />}
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}