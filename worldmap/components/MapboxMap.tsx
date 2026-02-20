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

  // Optional controls
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  flyToActive?: boolean;
};

export default function MapboxMap({
  pins = [],
  activePinId,
  onSelectPin,
  center = [0, 20],
  zoom = 1.2,
  flyToActive = true,
}: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const activePin = useMemo(
    () => pins.find((p) => p.id === activePinId),
    [pins, activePinId],
  );

  // 1) Init map once
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    if (!token) {
      console.error("❌ Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in .env.local");
      return;
    }

    mapboxgl.accessToken = token;

    console.log("🗺️ Initializing map…");

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center,
      zoom,
      interactive: true,
    });

    map.on("load", () => {
      console.log("✅ Map fully loaded");
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
      // cleanup markers
      for (const m of markersRef.current.values()) m.remove();
      markersRef.current.clear();

      map.remove();
      mapRef.current = null;
    };
  }, [token, center, zoom]);

  // 2) Build markers when pins change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // remove old markers
    for (const m of markersRef.current.values()) m.remove();
    markersRef.current.clear();

    // add new markers
    for (const p of pins) {
      const el = document.createElement("button");
      el.type = "button";
      el.title = p.title ?? "Pin";

      const isActive = p.id === activePinId;

      // marker styling
      el.style.width = isActive ? "16px" : "12px";
      el.style.height = isActive ? "16px" : "12px";
      el.style.borderRadius = "9999px";
      el.style.border = "1px solid rgba(255,255,255,0.35)";
      el.style.background = isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)";
      el.style.boxShadow = isActive ? "0 0 0 7px rgba(255,255,255,0.10)" : "none";
      el.style.cursor = "pointer";

      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelectPin?.(p.id);
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);

      markersRef.current.set(p.id, marker);
    }
  }, [pins, activePinId, onSelectPin]);

  // 3) Fly to active pin (optional)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!flyToActive) return;
    if (!activePin) return;

    map.flyTo({
      center: [activePin.lng, activePin.lat],
      zoom: Math.max(map.getZoom(), 4),
      speed: 1.2,
      curve: 1.2,
      essential: true,
    });
  }, [activePin, flyToActive]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{
        background: "#111",
        touchAction: "none",
      }}
    />
  );
}
