"use client";

import { useEffect, useRef, useState } from "react";

type Location = { city: string; region: string };

export default function LocationInput({
  value,
  onChange,
  required = false,
}: {
  value: Location;
  onChange: (city: string, region: string) => void;
  required?: boolean;
}) {
  const [input, setInput] = useState(() => (value.city ? `${value.city}${value.region ? ", " + value.region : ""}` : ""));
  const [suggestions, setSuggestions] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const timer = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setInput(value.city ? `${value.city}${value.region ? ", " + value.region : ""}` : "");
  }, [value.city, value.region]);

  function parseFeature(feature: any) {
    const city = feature.text || "";
    let region = "";
    if (Array.isArray(feature.context)) {
      const r = feature.context.find((c: any) => c.id?.startsWith("region"));
      if (r) region = r.text;
    }
    // Fallback: try place_name splitting
    if (!region && feature.place_name) {
      const parts = feature.place_name.split(",").map((s: string) => s.trim());
      if (parts.length >= 2) region = parts[parts.length - 1];
    }
    return { city, region };
  }

  async function fetchSuggestions(q: string) {
    if (!token) return setError("Mapbox token not configured");
    if (!q) return setSuggestions([]);
    setLoading(true);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?types=place,region&limit=6&access_token=${token}`;
      const res = await fetch(url);
      const json = await res.json();
      setSuggestions(json.features || []);
      setError(null);
    } catch (err) {
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
    timer.current = window.setTimeout(() => fetchSuggestions(v), 300);
  }

  function onSelect(feature: any) {
    const { city, region } = parseFeature(feature);
    setInput(feature.place_name);
    setSuggestions([]);
    onChange(city, region);
    setError(null);
  }

  async function onBlurValidate() {
    // If user typed but didn't select, try to geocode once and accept top result.
    if (!input) {
      onChange("", "");
      setError(required ? "Please select a location" : null);
      return;
    }
    if (suggestions.length > 0) return; // they could select

    try {
      setLoading(true);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(input)}.json?types=place,region&limit=1&access_token=${token}`;
      const res = await fetch(url);
      const json = await res.json();
      const feature = (json.features || [])[0];
      if (feature) {
        const { city, region } = parseFeature(feature);
        onChange(city, region);
        setInput(feature.place_name);
        setError(null);
      } else {
        onChange("", "");
        setError("Please choose a valid location from the list");
      }
    } catch (err) {
      setError("Failed to validate location");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <input
        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
        placeholder="Home city (type to search)"
        value={input}
        onChange={(e) => onInput(e.target.value)}
        onBlur={() => setTimeout(onBlurValidate, 120)}
        aria-autocomplete="list"
      />

      {suggestions.length > 0 ? (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-white/10 bg-black/90 p-1"
        >
          {suggestions.map((s: any) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(s)}
              className="mb-1 w-full text-left rounded px-3 py-2 text-sm hover:bg-white/5"
            >
              <div className="font-medium">{s.place_name}</div>
              <div className="text-xs text-zinc-400">{s.text}</div>
            </button>
          ))}
        </div>
      ) : null}

      {loading ? <div className="mt-1 text-xs text-zinc-400">Searching...</div> : null}
      {error ? <div className="mt-1 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}
    </div>
  );
}
