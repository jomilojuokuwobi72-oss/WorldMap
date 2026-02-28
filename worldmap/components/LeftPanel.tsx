"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, MapPin, X, Plus, Pencil } from "lucide-react";
import AddMemoryModal from "@/components/AddMemoryModal";

export type Pin = {
  id: string;
  title: string;
  subtitle: string;
  lat: number | null;
  lng: number | null;
};

export type PublicProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  tagline: string | null;
  home_city: string | null;
  home_region: string | null;
  share_slug: string | null;
};

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

export default function LeftPanel({
  mode = "dark",
  onSelectPin,
  activePinId,
  profile,
  shareUrl,
  pins,
  isOwner = false,
  editMode = false,
  onToggleEditMode,
  ownerId,
  onPinsChanged,
  onPinSelectedAfterCreate,
}: {
  mode?: "dark" | "light";
  onSelectPin?: (id: string) => void;
  activePinId?: string;

  ownerId?: string;
  profile?: PublicProfile;
  shareUrl?: string;
  pins?: Pin[];

  isOwner?: boolean;
  editMode?: boolean;
  onToggleEditMode?: () => void;
  onPinsChanged?: () => void;

  // NEW: optional callback used by your parent to select + fetch memories
  onPinSelectedAfterCreate?: (placeId: string) => void;
}) {
  const isLight = mode === "light";

  const demoProfile: PublicProfile = {
    id: "demo",
    full_name: "Aparna Sobhirala",
    avatar_url: "/profile2.jpeg",
    tagline: "Collecting moments, not just miles.",
    home_city: "Austin",
    home_region: "TX",
    share_slug: "aparna",
  };

  const safeProfile = profile ?? demoProfile;

  const safeShareUrl =
    shareUrl ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/${safeProfile.share_slug ?? "aparna"}`
      : `/${safeProfile.share_slug ?? "aparna"}`);

  const fullShareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${safeShareUrl.startsWith("/") ? "" : "/"}${safeShareUrl}`
      : safeShareUrl;

  const demoPins: Pin[] = [
    { id: "osaka", title: "Osaka", subtitle: "Japan · 2 memories", lat: 35.0116, lng: 135.7738 },
    { id: "austin", title: "Austin", subtitle: "USA · Home base", lat: 30.2672, lng: -97.7431 },
    { id: "dallas", title: "Dallas", subtitle: "USA · 1 memory", lat: 32.7765, lng: -96.7970 },
    { id: "houston", title: "Houston", subtitle: "USA · 2 memories", lat: 29.7604, lng: -95.3698 },
  ];

  const safePins = pins ?? demoPins;
  console.log("Rendering LeftPanel with pins:", safePins);

  const [copied, setCopied] = useState(false);
  const [time, setTime] = useState(() => formatTime(new Date()));
  const [pinsOpen, setPinsOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const dragStartY = useRef<number | null>(null);
  const dragDeltaY = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setTime(formatTime(new Date())), 1000);
    return () => clearInterval(t);
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(fullShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {}
  }

  function onDragStart(clientY: number) {
    dragStartY.current = clientY;
    dragDeltaY.current = 0;
  }

  function onDragMove(clientY: number) {
    if (dragStartY.current == null) return;
    dragDeltaY.current = clientY - dragStartY.current;
  }

  function onDragEnd() {
    if (dragStartY.current == null) return;
    const delta = dragDeltaY.current;
    if (delta > 24) setMobileExpanded(true);
    if (delta < -24) setMobileExpanded(false);
    dragStartY.current = null;
    dragDeltaY.current = 0;
  }

  const shellTheme = isLight ? "border-black/10 bg-white/78" : "border-white/10 bg-zinc-950/72";
  const textMain = isLight ? "text-black" : "text-white";
  const textSub = isLight ? "text-black/60" : "text-zinc-300";
  const textMuted = isLight ? "text-black/45" : "text-zinc-400";

  const pillBtn = isLight
    ? "border-black/10 bg-black/[0.04] text-black hover:bg-black/[0.06]"
    : "border-white/10 bg-white/10 text-white hover:bg-white/15";

  const row = isLight
    ? "border-black/10 bg-black/[0.03] hover:bg-black/[0.06]"
    : "border-white/10 bg-white/5 hover:bg-white/10";

  const displayName = safeProfile.full_name ?? "Profile";
  const displayTagline = safeProfile.tagline ?? null;
  const displayHomeCity = safeProfile.home_city ?? null;
  const displayHomeRegion = safeProfile.home_region ?? null;
  const avatarSrc = safeProfile.avatar_url ?? "/profile2.jpeg";

  const modalOwnerId = ownerId ?? safeProfile.id;

  return (
    <>
      {/* Add Memory Modal (owner-only) */}
      {isOwner && modalOwnerId ? (
        <AddMemoryModal
          ownerId={modalOwnerId}
          mode={mode}
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onCreated={() => onPinsChanged?.()}
          onSelectCreatedPin={(placeId) => {
            // select new pin and let parent fetch memories
            onSelectPin?.(placeId);
            onPinSelectedAfterCreate?.(placeId);
          }}
        />
      ) : null}

      {mobileExpanded ? (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMobileExpanded(false)} />
      ) : null}

      <aside
        className="
          fixed z-40
          top-[calc(env(safe-area-inset-top)+8px)] left-0 right-0 px-0
          md:left-5 md:right-auto md:top-5 md:px-0
          md:w-[360px]
        "
      >
        <div
          className={[
            "md:rounded-[28px] md:border md:shadow-2xl md:backdrop-blur",
            "rounded-b-[28px] rounded-t-none border-x-0 border-t-0 border-b shadow-2xl backdrop-blur",
            shellTheme,
          ].join(" ")}
        >
          <div className="px-4 pt-2 pb-1 md:p-4">
            {/* Profile */}
            <div className={`flex w-full items-center ${textMain} md:flex-col md:text-center`}>
              <div
                className={[
                  "relative overflow-hidden rounded-full border",
                  "h-24 w-24 md:h-28 md:w-28",
                  isLight ? "border-black/10" : "border-white/10",
                ].join(" ")}
              >
                <Image src={avatarSrc} alt={displayName} fill className="object-cover" priority />
              </div>

              <div className="flex-1 text-center">
                <h1 className="mt-1 text-lg font-semibold tracking-tight md:mt-3 md:text-3xl">
                  {displayName}
                </h1>
              </div>

              <button
                onClick={() => setPinsOpen(true)}
                className={`ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full border md:hidden ${pillBtn}`}
                aria-label="Open pins"
                title="Pins"
              >
                <MapPin size={16} />
              </button>

              <div className={`mt-1 text-sm font-medium md:text-lg ${textSub} hidden md:block`}>
                {displayHomeCity ? (
                  <>
                    {displayHomeCity}
                    {displayHomeRegion ? `, ${displayHomeRegion}` : ""}
                    <span className="mx-1 opacity-60">·</span>{" "}
                    <span className="tabular-nums">{time}</span>
                  </>
                ) : (
                  <>
                    <span className="tabular-nums">{time}</span>
                  </>
                )}
              </div>

              {displayTagline ? (
                <p
                  className={[
                    "mt-1 max-w-[28ch] text-sm hidden md:block",
                    isLight ? "text-black/60" : "text-zinc-300/80",
                  ].join(" ")}
                >
                  {displayTagline}
                </p>
              ) : null}
            </div>

            {/* Mobile drawer */}
            <div className="md:hidden">
              <div
                id="mobile-profile-drawer"
                className={[
                  "mx-auto mt-2 w-full max-w-[340px] overflow-hidden rounded-2xl border transition-all duration-300",
                  mobileExpanded ? "max-h-[220px] opacity-100" : "max-h-[0px] opacity-0",
                  isLight ? "border-black/10" : "border-white/10",
                ].join(" ")}
                style={{
                  background: isLight ? "rgba(255,255,255,0.78)" : "rgba(12,12,14,0.65)",
                }}
              >
                <div className="px-4 py-3 text-center">
                  <div className={`text-sm font-medium ${textSub}`}>
                    {displayHomeCity ? (
                      <>
                        {displayHomeCity}
                        {displayHomeRegion ? `, ${displayHomeRegion}` : ""}
                        <span className="mx-1 opacity-60">·</span>{" "}
                      </>
                    ) : null}
                    <span className="tabular-nums">{time}</span>
                  </div>

                  {displayTagline ? (
                    <p className={["mt-1 text-xs", isLight ? "text-black/60" : "text-zinc-300/80"].join(" ")}>
                      {displayTagline}
                    </p>
                  ) : null}

                  <button
                    onClick={copyLink}
                    className={`mt-3 inline-flex items-center justify-center rounded-full border px-4 py-2 ${pillBtn}`}
                    aria-label="Copy share link"
                    title={copied ? "Copied" : "Copy"}
                  >
                    <Copy size={16} />
                    <span className="ml-2 text-xs font-semibold">{copied ? "Copied" : "Copy link"}</span>
                  </button>
                </div>
              </div>

              <div
                className="mx-auto mt-1 w-full max-w-[220px] select-none"
                aria-expanded={mobileExpanded}
                aria-controls="mobile-profile-drawer"
                role="presentation"
                onClick={() => setMobileExpanded((prev) => !prev)}
                onTouchStart={(e) => onDragStart(e.touches[0].clientY)}
                onTouchMove={(e) => onDragMove(e.touches[0].clientY)}
                onTouchEnd={onDragEnd}
                onMouseDown={(e) => onDragStart(e.clientY)}
                onMouseMove={(e) => onDragMove(e.clientY)}
                onMouseUp={onDragEnd}
                onMouseLeave={onDragEnd}
              >
                <div className="mx-auto flex h-5 w-full items-center justify-center" aria-hidden="true">
                  <ChevronDown size={18} className={`transition-transform ${mobileExpanded ? "rotate-180" : ""}`} />
                </div>
              </div>
            </div>

            {/* Desktop */}
            <div className="hidden md:block">
              {/* Share */}
              <div
                className={[
                  "mt-5 rounded-2xl border p-3",
                  isLight ? "border-black/10 bg-black/[0.03]" : "border-white/10 bg-white/5",
                ].join(" ")}
              >
                <div className={`text-xs ${textMuted}`}>Share Link</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <div
                    className={[
                      "min-w-0 flex-1 truncate text-sm",
                      isLight ? "text-black/70" : "text-zinc-200",
                    ].join(" ")}
                  >
                    {safeShareUrl}
                  </div>
                  <button
                    onClick={copyLink}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${pillBtn}`}
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Pins */}
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <div className={`text-sm font-semibold ${textMain}`}>Pins</div>

                  {isOwner ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={onToggleEditMode}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${pillBtn} ${
                          editMode ? "ring-1 ring-white/20" : ""
                        }`}
                        aria-label={editMode ? "Exit edit mode" : "Enter edit mode"}
                        title={editMode ? "Exit edit mode" : "Edit memories"}
                      >
                        <Pencil size={14} />
                        {editMode ? "Done" : "Edit"}
                      </button>
                      <button
                        onClick={() => setAddOpen(true)}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${pillBtn}`}
                        aria-label="Add memory"
                        title="Add memory"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 max-h-[52vh] overflow-auto pr-1">
                  <ul className="space-y-2">
                    {safePins.map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => onSelectPin?.(p.id)}
                          className={["w-full rounded-2xl border px-3 py-3 text-left", row].join(" ")}
                        >
                          <div className={`text-sm font-semibold ${textMain}`}>{p.title}</div>
                          <div className={`mt-0.5 text-xs ${textMuted}`}>{p.subtitle}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div
            className={[
              "pointer-events-none h-6 md:h-10 rounded-b-[28px] bg-gradient-to-t",
              isLight ? "from-white/78 to-transparent" : "from-zinc-950/72 to-transparent",
            ].join(" ")}
          />
        </div>
      </aside>

      {/* Mobile Pins Popup */}
      {pinsOpen ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4 md:hidden"
          onMouseDown={() => setPinsOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={["w-full max-w-sm overflow-hidden rounded-[26px] border shadow-2xl backdrop-blur", shellTheme].join(" ")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className={`text-sm font-semibold ${textMain}`}>Pins</div>
              <button
                onClick={() => setPinsOpen(false)}
                className={`rounded-full border px-2.5 py-1.5 ${pillBtn}`}
                aria-label="Close pins"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-3 pb-3">
              {/* Owner-only controls */}
              {isOwner ? (
                <div className="mb-3 flex gap-2">
                  <button
                    onClick={() => {
                      setPinsOpen(false);
                      setAddOpen(true);
                    }}
                    className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${pillBtn}`}
                  >
                    <Plus size={16} />
                    Add memory
                  </button>
                  <button
                    onClick={() => {
                      onToggleEditMode?.();
                      setPinsOpen(false);
                    }}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${pillBtn} ${
                      editMode ? "ring-1 ring-white/20" : ""
                    }`}
                  >
                    <Pencil size={16} />
                    {editMode ? "Done" : "Edit"}
                  </button>
                </div>
              ) : null}

              <ul className="space-y-2">
                {safePins.map((p) => {
                  const isActive = activePinId === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => {
                          onSelectPin?.(p.id);
                          setPinsOpen(false);
                        }}
                        className={[
                          "w-full rounded-2xl border px-3 py-3 text-left",
                          row,
                          isActive ? (isLight ? "ring-1 ring-black/10" : "ring-1 ring-white/15") : "",
                        ].join(" ")}
                      >
                        <div className={`text-sm font-semibold ${textMain}`}>{p.title}</div>
                        <div className={`mt-0.5 text-xs ${textMuted}`}>{p.subtitle}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className={`mt-3 px-1 text-[11px] ${textMuted}`}>Tap a city to jump the map.</div>
            </div>

            <div
              className={[
                "pointer-events-none h-10 bg-gradient-to-t",
                isLight ? "from-white/78 to-transparent" : "from-zinc-950/72 to-transparent",
              ].join(" ")}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
