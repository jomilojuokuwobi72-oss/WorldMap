// app/[slug]/public-profile-client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import MapboxMap from "@/components/MapboxMap";
import LeftPanel, { type Pin, type PublicProfile } from "@/components/LeftPanel";
import BottomTray, { type MemoryCard } from "@/components/BottomTray";
import AddMemoryModal from "@/components/AddMemoryModal";
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
    placeId: m.place_id ?? undefined,
    happenedAtIso: m.happened_at ?? null,
    locationValue: {
      city: m.place?.city ?? "",
      region: m.place?.region ?? "",
      country: m.place?.country ?? "",
      country_code: m.place?.country_code ?? null,
      lat: m.place?.lat ?? null,
      lng: m.place?.lng ?? null,
      place_name: [m.place?.city, m.place?.region, m.place?.country].filter(Boolean).join(", "),
    },
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
  const [editMode, setEditMode] = useState(false);
  const [memoryEditing, setMemoryEditing] = useState<MemoryCard | null>(null);

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
        place:places ( city, region, country, country_code, lat, lng )
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
    if (!profileId) return [] as Pin[];

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
      return [] as Pin[];
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

      if (!count || count <= 0) {
        // Keep user_places clean: a pin with zero memories should disappear.
        await supabase.from("user_places").delete().eq("user_id", profileId).eq("place_id", pl.id);
        continue;
      }

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
    return nextPins;
  }

  async function deleteMemory(memoryId: string, placeId?: string) {
    const { data: mediaRows, error: mediaErr } = await supabase
      .from("memory_media")
      .select("id, storage_path")
      .eq("memory_id", memoryId);
    if (mediaErr) throw mediaErr;

    const paths = (mediaRows ?? [])
      .map((row) => row.storage_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);

    if (paths.length) {
      const { error: removeErr } = await supabase.storage.from("memory-media").remove(paths);
      if (removeErr) throw removeErr;
    }

    const { error: mediaDeleteErr } = await supabase.from("memory_media").delete().eq("memory_id", memoryId);
    if (mediaDeleteErr) throw mediaDeleteErr;

    const { error: memDeleteErr } = await supabase
      .from("memories")
      .delete()
      .eq("id", memoryId)
      .eq("user_id", profileId);
    if (memDeleteErr) throw memDeleteErr;

    if (placeId) {
      const { count, error: leftErr } = await supabase
        .from("memories")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", profileId)
        .eq("place_id", placeId);
      if (leftErr) throw leftErr;

      if (!count || count <= 0) {
        const { error: pinDeleteErr } = await supabase
          .from("user_places")
          .delete()
          .eq("user_id", profileId)
          .eq("place_id", placeId);
        if (pinDeleteErr) throw pinDeleteErr;
      }
    }
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
        {isOwner && profileId ? (
          <AddMemoryModal
            ownerId={profileId}
            mode="dark"
            open={Boolean(memoryEditing)}
            memoryToEdit={
              memoryEditing
                ? {
                    id: memoryEditing.id,
                    location: memoryEditing.locationValue ?? {
                      city: "",
                      region: "",
                      country: "",
                      country_code: null,
                      lat: null,
                      lng: null,
                      place_name: "",
                    },
                    description: memoryEditing.caption ?? "",
                    note: memoryEditing.details ?? "",
                    happened_at: memoryEditing.happenedAtIso ?? null,
                  }
                : null
            }
            onClose={() => setMemoryEditing(null)}
            onSaved={async (placeId) => {
              setMemoryEditing(null);
              await refreshPins();
              setActivePinId(placeId);
              await fetchMemoriesForPin(placeId);
            }}
          />
        ) : null}

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
          editMode={editMode}
          onToggleEditMode={() => setEditMode((prev) => !prev)}
          ownerId={profileId}
          onPinsChanged={async () => {
            const nextPins = await refreshPins();
            if (nextPins.length === 0) {
              setActivePinId(undefined);
              setMemories([]);
              return;
            }
            if (activePinId) await fetchMemoriesForPin(activePinId);
          }}
          onPinSelectedAfterCreate={(placeId) => {
            setActivePinId(placeId);
            fetchMemoriesForPin(placeId);
          }}
        />

        <BottomTray
          memories={memories}
          activeLocation={activeLocation}
          loading={loadingMemories}
          editMode={editMode}
          canEdit={isOwner}
          onEditMemory={(memory) => setMemoryEditing(memory)}
          onDeleteMemory={async (memory) => {
            const ok = window.confirm(`Delete memory "${memory.caption ?? "Untitled"}"? This cannot be undone.`);
            if (!ok) return;
            try {
              await deleteMemory(memory.id, memory.placeId);
              const nextPins = await refreshPins();
              const stillHasActive = activePinId ? nextPins.some((p) => p.id === activePinId) : false;

              if (stillHasActive && activePinId) {
                await fetchMemoriesForPin(activePinId);
                return;
              }

              const nextActiveId = nextPins[0]?.id;
              if (!nextActiveId) {
                setActivePinId(undefined);
                setMemories([]);
                return;
              }

              setActivePinId(nextActiveId);
              await fetchMemoriesForPin(nextActiveId);
            } catch (e) {
              console.warn("delete memory failed", e);
              window.alert("Could not delete memory. Please try again.");
            }
          }}
        />
      </div>
    </main>
  );
}
