"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";

export type MemoryCard = {
  id: string;
  src: string;
  location: string;
  takenAt: string;
  caption?: string; // title (description)
  details?: string; // long description (note)
};

function PolaroidMini({
  m,
  index,
  onOpen,
}: {
  m: MemoryCard;
  index: number;
  onOpen: () => void;
}) {
  const tilt = useMemo(() => {
    const base = index % 2 === 0 ? -2 : 2;
    const extra = (index % 3) - 1;
    return base + extra;
  }, [index]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative w-[170px] shrink-0 text-left sm:w-[190px]"
      aria-label={`Open memory in ${m.location}`}
    >
      <div
        className="rounded-2xl border border-white/10 bg-zinc-950/70 text-white shadow-xl backdrop-blur transition-transform duration-200 group-hover:-translate-y-1"
        style={{ transform: `rotate(${tilt}deg)` }}
      >
        <div className="p-3">
          <div className="relative h-[110px] w-full overflow-hidden rounded-xl bg-zinc-900">
            <Image
              src={m.src}
              alt={m.caption ?? m.location}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              sizes="190px"
            />
          </div>

          <div className="pt-3 pb-1">
            <div className="polaroid-hand text-[18px] leading-[18px]">{m.location}</div>
            <div className="mt-1 text-xs text-zinc-300/80">{m.takenAt}</div>

            {m.caption ? (
              <div
                className="mt-1 text-xs text-zinc-400 overflow-hidden text-ellipsis"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2, // crop in tray
                  WebkitBoxOrient: "vertical",
                }}
              >
                {m.caption}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

/** ✅ Skeleton mini that matches the PolaroidMini size/layout */
function PolaroidSkeleton({ index }: { index: number }) {
  const tilt = useMemo(() => {
    const base = index % 2 === 0 ? -2 : 2;
    const extra = (index % 3) - 1;
    return base + extra;
  }, [index]);

  return (
    <div className="relative w-[170px] shrink-0 sm:w-[190px]" aria-hidden="true">
      <div
        className="rounded-2xl border border-white/10 bg-zinc-950/70 text-white shadow-xl backdrop-blur"
        style={{ transform: `rotate(${tilt}deg)` }}
      >
        <div className="p-3">
          <div className="relative h-[110px] w-full overflow-hidden rounded-xl bg-zinc-900">
            {/* shimmer */}
            <div className="absolute inset-0 animate-pulse bg-white/10" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_1.4s_infinite]" />
          </div>

          <div className="pt-3 pb-1 space-y-2">
            <div className="h-[18px] w-3/4 rounded bg-white/10 animate-pulse" />
            <div className="h-[12px] w-1/2 rounded bg-white/10 animate-pulse" />
            <div className="h-[12px] w-full rounded bg-white/10 animate-pulse" />
            <div className="h-[12px] w-5/6 rounded bg-white/10 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Adds the shimmer keyframes once via inline global style */
function ShimmerStyles() {
  return (
    <style jsx global>{`
      @keyframes shimmer {
        0% {
          transform: translateX(-120%);
        }
        100% {
          transform: translateX(120%);
        }
      }
    `}</style>
  );
}

function MemoryModal({
  memory,
  onClose,
}: {
  memory: MemoryCard;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{memory.location}</div>
            <div className="text-xs text-zinc-400">{memory.takenAt}</div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="grid md:grid-cols-2">
          <div className="relative h-[320px] w-full md:h-[520px]">
            <Image
              src={memory.src}
              alt={memory.caption ?? memory.location}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          </div>

          <div className="p-5">
            {/* Title = short description */}
            <div className="text-lg font-semibold">{memory.caption ?? "Memory"}</div>

            {/* Full long note (not cropped) */}
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-300">
              {memory.details ?? "Add details later."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BottomTray({
  memories,
  activeLocation,
  loading = false,
}: {
  memories?: MemoryCard[];
  activeLocation?: string;
  loading?: boolean;
}) {
  const [selected, setSelected] = useState<MemoryCard | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const dragDeltaY = useRef(0);

  const safeMemories = memories ?? [];
  const safeActiveLocation = activeLocation ?? (safeMemories[0]?.location ?? "Memories");

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
    if (delta < -24) setMobileExpanded(true);
    if (delta > 24) setMobileExpanded(false);
    dragStartY.current = null;
    dragDeltaY.current = 0;
  }

  return (
    <>
      <ShimmerStyles />

      {mobileExpanded ? (
        <div className="fixed inset-0 z-20 md:hidden" onClick={() => setMobileExpanded(false)} />
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 px-0 md:bottom-6 wm-tray">
        <div className="pointer-events-auto w-full max-w-none wm-tray-inner md:px-0">
          <div
            className="translate-y-[var(--tray-offset)] rounded-[26px] border border-white/10 bg-zinc-950/55 shadow-2xl backdrop-blur transition-transform duration-300 md:translate-y-0"
            style={{ ["--tray-offset" as any]: mobileExpanded ? "0px" : "170px" }}
          >
            <div
              className="relative flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2 md:py-3"
              onClick={() => setMobileExpanded((prev) => !prev)}
              onTouchStart={(e) => onDragStart(e.touches[0].clientY)}
              onTouchMove={(e) => onDragMove(e.touches[0].clientY)}
              onTouchEnd={onDragEnd}
              onMouseDown={(e) => onDragStart(e.clientY)}
              onMouseMove={(e) => onDragMove(e.clientY)}
              onMouseUp={onDragEnd}
              onMouseLeave={onDragEnd}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">{safeActiveLocation}</div>
                <div className="text-xs text-zinc-400">{loading ? "Loading…" : "Memories"}</div>
              </div>

              <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 md:hidden">
                <ChevronUp size={16} className={`transition-transform ${mobileExpanded ? "rotate-180" : ""}`} />
              </div>
            </div>

            <div className="flex gap-4 overflow-x-auto px-4 py-4">
              {loading ? (
                Array.from({ length: 6 }).map((_, idx) => <PolaroidSkeleton key={`sk-${idx}`} index={idx} />)
              ) : (
                safeMemories.map((m, idx) => (
                  <PolaroidMini key={m.id} m={m} index={idx} onOpen={() => setSelected(m)} />
                ))
              )}

              <div className="w-2 shrink-0" />
            </div>
          </div>
        </div>
      </div>

      {!loading && selected ? <MemoryModal memory={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
