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
  return parts.length ? parts.join(", ") : p.country ?? "Unknown";
}

function toMemoryCard(m: any, cover: any | null): MemoryCard {
  const location = placeLabel(m.place);
  const takenAt = m.happened_at
    ? new Date(m.happened_at).toLocaleString()
    : cover?.taken_at
      ? new Date(cover.taken_at).toLocaleString()
      : "Unknown time";

  const description = (m.description ?? "").toString();
  const caption = description || undefined;

  const note = (m.note ?? "").toString();

  const src = cover?.storage_path ? publicStorageUrl("memory-media", cover.storage_path) : "/samples/arlington.jpeg";

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

  const [pinState, setPinState] = useState<Pin[]>(pins ?? []);
  const [activePinId, setActivePinId] = useState<string | undefined>(initialActivePinId);
  const [memories, setMemories] = useState<MemoryCard[]>(initialMemories ?? []);
  const [loadingMemories, setLoadingMemories] = useState(false);

  const [isOwner, setIsOwner] = useState(false);

  const shareUrl = useMemo(() => `/${profileSlug}`, [profileSlug]);

  const activeLocation = useMemo(() => {
    const p = pinState.find((x) => x.id === activePinId);
    return p?.title ?? (memories[0]?.location ?? "Memories");
  }, [pinState, activePinId, memories]);

  async function fetchMemoriesForPin(placeId: string) {
    if (!profileId || !placeId) {
      setMemories([]);
      return;
    }

    setLoadingMemories(true);

    const { data: memRows, error: memErr } = await supabase
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
      return arr[0] ?? null;
    }

    setMemories(memoriesRaw.map((m) => toMemoryCard(m, pickCover(m))));
    setLoadingMemories(false);
  }

  async function refreshPins() {
    if (!profileId) return;

    // Pull all places the user has pinned (user_places join places)
    const { data: rows, error } = await supabase
      .from("user_places")
      .select(
        `
        place:places (
          id,
          city,
          region,
          country,
          lat,
          lng
        )
      `
      )
      .eq("user_id", profileId);

    if (error) {
      console.warn("pins refresh error:", error);
      return;
    }

    const places = (rows ?? []).map((r: any) => r.place).filter(Boolean);

    // Count memories per place (simple loop, fine for now)
    const nextPins: Pin[] = [];
    for (const pl of places) {
      const title = [pl.city, pl.region].filter(Boolean).join(", ") || pl.country || "Unknown";

      const { count } = await supabase
        .from("memories")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", profileId)
        .eq("place_id", pl.id);

      const subtitle = `${pl.country ?? "—"} · ${(count ?? 0).toString()} memories`;

      nextPins.push({
        id: pl.id,
        title,
        subtitle,
        lat: pl.lat ?? null,
        lng: pl.lng ?? null,
      });
    }

    // stable sort: title
    nextPins.sort((a, b) => a.title.localeCompare(b.title));
    setPinState(nextPins);
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? "";
      setIsOwner(Boolean(uid && profileId && uid === profileId));
    })();
  }, [profileId]);

  useEffect(() => {
    if (!activePinId && pinState.length > 0) {
      const first = pinState[0].id;
      setActivePinId(first);
      fetchMemoriesForPin(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinState]);

  return (
    <main className="h-[100svh] w-full bg-black text-white">
      <div className="relative h-full w-full">
        <div className="absolute inset-0">
          <MapboxMap
            pins={pinState.map((p: any) => ({
              id: p.id,
              title: p.title,
              lat: p.lat,
              lng: p.lng,
            }))}
            activePinId={activePinId}
            onSelectPin={(id) => {
              setActivePinId(id);
              fetchMemoriesForPin(id);
            }}
          />
        </div>

        <LeftPanel
          mode="dark"
          profile={profile}
          shareUrl={shareUrl}
          pins={pinState}
          activePinId={activePinId}
          onSelectPin={(id) => {
            setActivePinId(id);
            fetchMemoriesForPin(id);
          }}
          isOwner={isOwner}
          ownerId={profileId}
          onPinsChanged={async () => {
            await refreshPins();
            if (activePinId) await fetchMemoriesForPin(activePinId);
          }}
          onPinSelectedAfterCreate={(placeId) => {
            setActivePinId(placeId);
            fetchMemoriesForPin(placeId);
          }}
        />

        <BottomTray memories={memories} activeLocation={activeLocation} loading={loadingMemories} />
      </div>
    </main>
  );
}