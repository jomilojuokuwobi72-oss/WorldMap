// app/[slug]/page.tsx
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PublicProfileClient from "./public-profile-client";

type Params = Promise<{ slug: string }>;

function normalizeSlug(raw: string) {
  return decodeURIComponent(raw).trim().toLowerCase();
}

function placeLabel(
  p?: { city?: string | null; region?: string | null; country?: string | null } | null
) {
  if (!p) return "Unknown";
  const parts = [p.city, p.region].filter(Boolean);
  return parts.length ? parts.join(", ") : p.country ?? "Unknown";
}

function publicStorageUrl(bucket: string, path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return path;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

function toMemoryCard(m: any, cover: any | null) {
  const location = placeLabel(m.place);
  const takenAt = m.happened_at
    ? new Date(m.happened_at).toLocaleString()
    : cover?.taken_at
      ? new Date(cover.taken_at).toLocaleString()
      : "Unknown time";

  const description = (m.description ?? "").toString();
  const caption = description || undefined;

  const note = (m.note ?? "").toString();

  const src = cover?.storage_path
    ? publicStorageUrl("memory-media", cover.storage_path)
    : "/samples/arlington.jpeg";

  return {
    id: m.id,
    src,
    location,
    takenAt,
    caption,
    details: note || undefined,
  };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  if (!slug) notFound();

  const s = normalizeSlug(slug);
  const candidates = Array.from(new Set([s, s.replace(/_/g, "-"), s.replace(/-/g, "_")]));

  // 1) PROFILE
  let profile: any = null;
  for (const candidate of candidates) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, tagline, home_city, home_region, share_slug, is_public")
      .ilike("share_slug", candidate)
      .maybeSingle();
    if (data) {
      profile = data;
      break;
    }
  }

  if (!profile || profile.is_public === false) notFound();
  const userId = profile.id as string;

  // 2) PINS (✅ now includes lat/lng)
  const { data: pinsRaw } = await supabase
    .from("user_places")
    .select(
      `
      place_id,
      label,
      pinned,
      created_at,
      place:places ( id, city, region, country, lat, lng )
    `
    )
    .eq("user_id", userId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  const pins = (pinsRaw ?? []) as any[];
  const initialActivePlaceId = pins.find((p) => p.pinned)?.place_id ?? pins[0]?.place_id ?? null;

  // 3) INITIAL MEMORIES + MEDIA
  let initialMemories: any[] = [];
  const mediaByMemoryId = new Map<string, any[]>();

  if (initialActivePlaceId) {
    const { data: memoriesRaw } = await supabase
      .from("memories")
      .select(
        `
        id,
        description,
        note,
        happened_at,
        place_id,
        place:places ( city, region, country )
      `
      )
      .eq("user_id", userId)
      .eq("place_id", initialActivePlaceId)
      .order("happened_at", { ascending: false });

    initialMemories = (memoriesRaw ?? []) as any[];

    const memoryIds = initialMemories.map((m) => m.id).filter(Boolean);

    if (memoryIds.length) {
      const { data: mediaRows } = await supabase
        .from("memory_media")
        .select("id, memory_id, storage_path, taken_at, sort_order, created_at")
        .in("memory_id", memoryIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      for (const row of mediaRows ?? []) {
        const arr = mediaByMemoryId.get(row.memory_id) ?? [];
        arr.push(row);
        mediaByMemoryId.set(row.memory_id, arr);
      }
    }
  }

  function pickCover(m: any) {
    const arr = mediaByMemoryId.get(m.id) ?? [];
    return arr[0] ?? null;
  }

  const initialMemoryCards = initialMemories.map((m) => toMemoryCard(m, pickCover(m)));

  // ✅ pinCards now includes lat/lng
  const pinCards = pins
    .map((p) => {
      const title = p.label ?? placeLabel(p.place);
      const subtitle = p.place?.country ? `${p.place.country}` : "—";

      const lat = p.place?.lat;
      const lng = p.place?.lng;

      if (typeof lat !== "number" || typeof lng !== "number") return null;

      return { id: p.place_id, title, subtitle, lat, lng };
    })
    .filter(Boolean);

  return (
    <PublicProfileClient
      profile={profile}
      pins={pinCards as any}
      initialActivePinId={initialActivePlaceId ?? undefined}
      initialMemories={initialMemoryCards}
    />
  );
}
