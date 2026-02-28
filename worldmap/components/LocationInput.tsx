"use client";

import { useEffect, useRef, useState } from "react";

export type LocationValue = {
  city: string;
  region: string;
  country: string;
  country_code: string | null;
  lat: number | null;
  lng: number | null;
  place_name: string; // Mapbox display label
};

const EMPTY_LOCATION: LocationValue = {
  city: "",
  region: "",
  country: "",
  country_code: null,
  lat: null,
  lng: null,
  place_name: "",
};

export default function LocationInput({
  value,
  onChange,
  required = false,
  placeholder = "Search a city…",
}: {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState(() => value.place_name || "");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const timer = useRef<number | null>(null);

  useEffect(() => {
    // Keep input aligned with controlled value
    setInput(value.place_name || "");
  }, [value.place_name]);

  function getContextText(feature: any, prefix: string) {
    const ctx = Array.isArray(feature.context) ? feature.context : [];
    const match = ctx.find((c: any) => String(c?.id || "").startsWith(prefix));
    return match?.text || "";
  }

  function getCountryCode(feature: any) {
    // Mapbox country context usually has short_code (e.g. "us")
    const ctx = Array.isArray(feature.context) ? feature.context : [];
    const match = ctx.find((c: any) => String(c?.id || "").startsWith("country"));
    const code = match?.short_code;
    return code ? String(code).toUpperCase() : null;
  }

  function parseFeature(feature: any): LocationValue {
    const city = feature.text || "";
    const region = getContextText(feature, "region");
    const country = getContextText(feature, "country");

    // coordinates
    const coords = feature.center || feature.geometry?.coordinates; // [lng, lat]
    const lng = Array.isArray(coords) ? Number(coords[0]) : null;
    const lat = Array.isArray(coords) ? Number(coords[1]) : null;

    return {
      city: String(city || "").trim(),
      region: String(region || "").trim(),
      country: String(country || "").trim(),
      country_code: getCountryCode(feature),
      lat: Number.isFinite(lat as any) ? (lat as number) : null,
      lng: Number.isFinite(lng as any) ? (lng as number) : null,
      place_name: String(feature.place_name || "").trim() || [city, region, country].filter(Boolean).join(", "),
    };
  }

  async function fetchSuggestions(q: string) {
    if (!token) {
      setError("Mapbox token not configured");
      return;
    }
    if (!q.trim()) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      // include country so Mapbox returns country context reliably
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        q
      )}.json?types=place&limit=6&access_token=${token}`;

      const res = await fetch(url);
      const json = await res.json();
      setSuggestions(json.features || []);
      setError(null);
    } catch {
      setError("Failed to fetch locations");
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  function onInput(v: string) {
    setInput(v);
    setError(null);

    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => fetchSuggestions(v), 250);
  }

  function onSelect(feature: any) {
    const next = parseFeature(feature);
    setInput(next.place_name);
    setSuggestions([]);
    onChange(next);
    setError(null);
  }

  async function onBlurValidate() {
    // If user cleared the input
    if (!input.trim()) {
      onChange(EMPTY_LOCATION);
      setError(required ? "Please select a location" : null);
      return;
    }

    // If they have suggestions open, let them pick
    if (suggestions.length > 0) return;

    // If input matches current selected label, accept
    if (value.place_name && input.trim() === value.place_name.trim()) {
      setError(null);
      return;
    }

    // Otherwise: validate top result
    if (!token) {
      setError("Mapbox token not configured");
      return;
    }

    setLoading(true);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        input
      )}.json?types=place&limit=1&access_token=${token}`;

      const res = await fetch(url);
      const json = await res.json();
      const feature = (json.features || [])[0];

      if (!feature) {
        onChange(EMPTY_LOCATION);
        setError("Please choose a valid location from the list");
        return;
      }

      const next = parseFeature(feature);
      setInput(next.place_name);
      onChange(next);
      setError(null);
    } catch {
      setError("Failed to validate location");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <input
        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-white/20"
        placeholder={placeholder}
        value={input}
        onChange={(e) => onInput(e.target.value)}
        onBlur={() => setTimeout(onBlurValidate, 120)}
        aria-autocomplete="list"
      />

      {suggestions.length > 0 ? (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-white/10 bg-black/90 p-1">
          {suggestions.map((s: any) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(s)}
              className="mb-1 w-full rounded px-3 py-2 text-left text-sm hover:bg-white/5"
            >
              <div className="font-medium">{s.place_name}</div>
              <div className="text-xs text-zinc-400">{s.text}</div>
            </button>
          ))}
        </div>
      ) : null}

      {loading ? <div className="mt-1 text-xs text-zinc-400">Searching...</div> : null}
      {error ? (
        <div className="mt-1 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}
    </div>
  );
}