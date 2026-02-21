"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";

export type MapPin = {
  id: string;
  title?: string;
  lat: number;
  lng: number;
};

type MapboxMapProps = {
  pins?: MapPin[];
  activePinId?: string;
  onSelectPin?: (id: string) => void;

  center?: [number, number]; // [lng, lat]
  zoom?: number;
  flyToActive?: boolean;

  // glow color for active marker
  activeColor?: string; // default cyan
};

export default function MapboxMap({
  pins = [],
  activePinId,
  onSelectPin,
  center = [0, 20],
  zoom = 1.2,
  flyToActive = true,
  activeColor = "#4FD1FF",
}: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // marker instances by pin id
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  // marker DOM elements by pin id (so we can update styles without rebuild)
  const elsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const activePin = useMemo(
    () => pins.find((p) => p.id === activePinId),
    [pins, activePinId]
  );

  // helper: apply active/inactive styles
  function applyMarkerStyle(el: HTMLButtonElement, isActive: boolean) {
    el.style.width = isActive ? "14px" : "12px";
    el.style.height = isActive ? "14px" : "12px";
    el.style.borderRadius = "9999px";
    el.style.cursor = "pointer";

    // your original clean white dot
    el.style.border = "1px solid rgba(255,255,255,0.35)";
    el.style.background = isActive
      ? "rgba(255,255,255,0.98)"
      : "rgba(255,255,255,0.40)";

    // ONLY difference: glow on active
    el.style.boxShadow = isActive
      ? `0 0 0 7px ${hexToRgba(activeColor, 0.18)}, 0 0 22px ${hexToRgba(
          activeColor,
          0.45
        )}`
      : "none";

    el.style.transition =
      "box-shadow 180ms ease, background 180ms ease, width 180ms ease, height 180ms ease";
  }

  function hexToRgba(hex: string, a: number) {
    const h = hex.replace("#", "").trim();
    if (h.length !== 6) return `rgba(79,209,255,${a})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // 1) Init map ONCE
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    if (!token) {
      console.error("❌ Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in .env.local");
      return;
    }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      // keep whatever style you want
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center,
      zoom,
      interactive: true,
    });

    map.on("load", () => {
      map.touchZoomRotate.enable();
      map.dragPan.enable();
      map.scrollZoom.enable();
      map.resize();
    });

    map.on("error", (e) => {
      console.error("❌ Mapbox error:", e);
    });

    mapRef.current = map;

    return () => {
      for (const m of markersRef.current.values()) m.remove();
      markersRef.current.clear();
      elsRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // 2) Sync markers when pins change (add/remove/update positions)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existingMarkers = markersRef.current;
    const existingEls = elsRef.current;

    const nextIds = new Set(pins.map((p) => p.id));

    // remove markers no longer present
    for (const [id, marker] of existingMarkers.entries()) {
      if (!nextIds.has(id)) {
        marker.remove();
        existingMarkers.delete(id);
        existingEls.delete(id);
      }
    }

    // add/update markers
    for (const p of pins) {
      const isActive = p.id === activePinId;

      const existing = existingMarkers.get(p.id);
      if (existing) {
        existing.setLngLat([p.lng, p.lat]);
        // keep style correct
        const el = existingEls.get(p.id);
        if (el) applyMarkerStyle(el, isActive);
        continue;
      }

      const el = document.createElement("button");
      el.type = "button";
      el.title = p.title ?? "Pin";
      applyMarkerStyle(el, isActive);

      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelectPin?.(p.id);
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);

      existingMarkers.set(p.id, marker);
      existingEls.set(p.id, el);
    }
  }, [pins, activePinId, onSelectPin, activeColor]);

  // 3) Smooth fly to active pin (NO reset)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!flyToActive) return;
    if (!activePin) return;

    map.flyTo({
      center: [activePin.lng, activePin.lat],
      zoom: Math.max(map.getZoom(), 4),
      speed: 1.0,
      curve: 1.2,
      essential: true,
    });
  }, [activePin, flyToActive]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ background: "#111", touchAction: "none" }}
    />
  );
}