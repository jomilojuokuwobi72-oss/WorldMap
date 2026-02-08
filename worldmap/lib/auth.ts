// lib/auth.ts
import { supabase } from "./supabaseClient";

export type SignupPayload = {
  email: string;
  password: string;
  full_name: string;
  avatar_url?: string; // will be set after upload
  tagline?: string;
  home_city?: string;
  home_region?: string;
  share_slug: string; // REQUIRED now
  is_public?: boolean;
};

export function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+)|(-+$)/g, "")
    .slice(0, 60);
}

/** Case-insensitive slug availability check */
export async function isSlugTaken(slugRaw: string) {
  const slug = slugify(slugRaw);
  if (!slug) return true;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("share_slug", slug)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

export async function signUp(payload: SignupPayload) {
  const { email, password, ...profile } = payload;

  const share_slug = slugify(profile.share_slug);
  if (!share_slug) {
    return {
      user: null,
      signUpError: { message: "Invalid share slug." } as any,
    };
  }

  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: profile.full_name,
        avatar_url: profile.avatar_url || null,
        tagline: profile.tagline || null,
        home_city: profile.home_city || null,
        home_region: profile.home_region || null,
        share_slug,
        is_public: profile.is_public ?? true,
      },
    },
  });

  return { user: data.user ?? null, signUpError };
}

export async function upsertProfile(
  userId: string,
  profile: Omit<SignupPayload, "email" | "password">,
) {
  const share_slug = slugify(profile.share_slug);

  const { error } = await supabase
    .from("profiles")
    .upsert(
      [
        {
          id: userId,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url || null,
          tagline: profile.tagline || null,
          home_city: profile.home_city || null,
          home_region: profile.home_region || null,
          share_slug,
          is_public: profile.is_public ?? true,
        },
      ],
      { onConflict: "id" },
    );

  if (!error) return { error: null };

  const msg = (error as any)?.message || "";
  const code = (error as any)?.code || "";

  // Postgres unique violation is usually 23505
  const slugTaken =
    code === "23505" ||
    msg.toLowerCase().includes("duplicate") ||
    msg.toLowerCase().includes("share_slug") ||
    msg.toLowerCase().includes("profiles_share_slug_unique");

  if (slugTaken) {
    return {
      error: {
        ...error,
        friendly: "This slug is already taken. Try another one.",
        reason: "SLUG_TAKEN",
      },
    };
  }

  return { error };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error };
}

export function getSession() {
  return supabase.auth.getSession();
}

export function onAuthStateChange(handler: (event: string, session: any) => void) {
  return supabase.auth.onAuthStateChange(handler);
}
