import { supabase } from "@/lib/supabaseClient";

function normalizePlaceKey(city?: string, region?: string, country?: string) {
  const parts = [city, region, country]
    .filter(Boolean)
    .map((s) => (s || "").trim().toLowerCase());
  return parts.join("|");
}

export async function ensurePlace(city: string, region: string, country = "United States") {
  const normalized_key = normalizePlaceKey(city, region, country);

  const found = await supabase.from("places").select("id").eq("normalized_key", normalized_key).maybeSingle();
  if (found.error) throw found.error;
  if (found.data?.id) return found.data.id as string;

  const inserted = await supabase
    .from("places")
    .insert([{ city, region, country, normalized_key }])
    .select("id")
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data.id as string;
}