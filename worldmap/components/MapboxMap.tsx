"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = "pk.eyJ1Ijoiam9taTIzIiwiYSI6ImNta3hiNzIyeTA4bWMzanB4cmVtbTNiZTUifQ.Egu7V1RipQ25vUUGHPANcw";

export default function MapboxMap() {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    console.log("🗺️ Initializing map…");

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [0, 20],
      zoom: 1.2,
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

    return () => map.remove();
  }, []);

  return (
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height: "100vh",
        background: "#ddd",
        touchAction: "none",
      }}
    />
  );
}
