// app/[slug]/public-profile-client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import MapboxMap from "@/components/MapboxMap";
import LeftPanel, { type Pin, type PublicProfile } from "@/components/LeftPanel";
import BottomTray, { type MemoryCard } from "@/components/BottomTray";
import { supabase } from "@/lib/supabaseClient";

function publicStorageUrl(bucket: string, path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return path;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

function placeLabel(p?: { city?: string | null; region?: string | null; country?: string | null } | null) {
  if (!p) return "Unknown";
  const parts = [p.city, p.region].filter(Boolean);
  return parts.length ? parts.join(", ") : (p.country ?? "Unknown");
}

function toMemoryCard(m: any, cover: any | null): MemoryCard {
  const location = placeLabel(m.place);
  const takenAt = m.happened_at
    ? new Date(m.happened_at).toLocaleString()
    : (cover?.taken_at ? new Date(cover.taken_at).toLocaleString() : "Unknown time");

  const note = (m.note ?? "").toString();
  const caption = note ? (note.length > 42 ? note.slice(0, 42) + "…" : note) : undefined;

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

export default function PublicProfileClient({
  profile,
  pins,
  initialActivePinId,
  initialMemories,
}: {
  profile: PublicProfile;
  pins: Pin[];
  initialActivePinId?: string;
  initialMemories: MemoryCard[];
}) {
  const profileId = profile?.id ?? "";
  const profileSlug = profile?.share_slug ?? "";

  const [activePinId, setActivePinId] = useState<string | undefined>(initialActivePinId);
  const [memories, setMemories] = useState<MemoryCard[]>(initialMemories ?? []);
  const [loadingMemories, setLoadingMemories] = useState(false);

  const shareUrl = useMemo(() => `/${profileSlug}`, [profileSlug]);

  const activeLocation = useMemo(() => {
    const p = pins.find((x) => x.id === activePinId);
    return p?.title ?? (memories[0]?.location ?? "Memories");
  }, [pins, activePinId, memories]);

  async function fetchMemoriesForPin(placeId: string) {
    if (!profileId || !placeId) {
      setMemories([]);
      return;
    }

    setLoadingMemories(true);

    // ✅ REMOVED cover_media_id from select
    const { data: memRows, error: memErr } = await supabase
      .from("memories")
      .select(
        `
        id,
        note,
        happened_at,
        place_id,
        place:places ( city, region, country )
      `,
      )
      .eq("user_id", profileId)
      .eq("place_id", placeId)
      .order("happened_at", { ascending: false });

    if (memErr) {
      console.warn("memories fetch error:", memErr);
      setMemories([]);
      setLoadingMemories(false);
      return;
    }

    const memoriesRaw = memRows ?? [];
    const memoryIds = memoriesRaw.map((m) => m.id).filter(Boolean);

    const mediaByMemoryId = new Map<string, any[]>();

    if (memoryIds.length) {
      const { data: mediaRows, error: mediaErr } = await supabase
        .from("memory_media")
        .select("id, memory_id, storage_path, taken_at, sort_order, created_at")
        .in("memory_id", memoryIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (mediaErr) console.warn("media fetch error:", mediaErr);

      for (const row of mediaRows ?? []) {
        const arr = mediaByMemoryId.get(row.memory_id) ?? [];
        arr.push(row);
        mediaByMemoryId.set(row.memory_id, arr);
      }
    }

    function pickCover(m: any) {
      const arr = mediaByMemoryId.get(m.id) ?? [];
      return arr[0] ?? null; // ✅ first media = cover
    }

    setMemories(memoriesRaw.map((m) => toMemoryCard(m, pickCover(m))));
    setLoadingMemories(false);
  }

  useEffect(() => {
    if (!activePinId && pins.length > 0) {
      const first = pins[0].id;
      setActivePinId(first);
      fetchMemoriesForPin(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  return (
    <main className="h-[100svh] w-full bg-black text-white">
      <div className="relative h-full w-full">
        <div className="absolute inset-0">
          <MapboxMap />
        </div>

        <LeftPanel
          mode="dark"
          profile={profile}
          shareUrl={shareUrl}
          pins={pins}
          activePinId={activePinId}
          onSelectPin={(id) => {
            setActivePinId(id);
            fetchMemoriesForPin(id);
          }}
        />

        <BottomTray
          memories={
            loadingMemories
              ? [
                  {
                    id: "loading",
                    src: "/samples/arlington.jpeg",
                    location: activeLocation,
                    takenAt: "Loading…",
                    caption: "Loading memories…",
                    details: "Loading memories…",
                  },
                ]
              : memories
          }
          activeLocation={activeLocation}
        />
      </div>
    </main>
  );
}
