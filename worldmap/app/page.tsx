// app/page.tsx
"use client";

import Link from "next/link";
import MapboxMap from "@/components/MapboxMap";

export default function LandingPage() {
  return (
    <main className="h-[100svh] w-full bg-black text-white">
      <div className="relative h-full w-full">
        <div className="absolute inset-0">
          <MapboxMap />
          <div className="absolute inset-0 bg-black/55" />
        </div>

        <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-center px-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
              Your memories, pinned to the world.
            </h1>
            <p className="mt-4 text-base text-zinc-300 md:text-lg">
              Build a personal map of places you’ve been and moments you want to remember.
              Share a single link with friends—or keep it private.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-6 py-3 text-sm font-semibold hover:bg-white/15"
              >
                Join early (create your map)
              </Link>

              <Link
                href="/aparna"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-transparent px-6 py-3 text-sm font-semibold text-white/80 hover:bg-white/5"
              >
                View a sample profile
              </Link>
            </div>

            <div className="mt-6 text-xs text-white/60">
              Early access: you’ll create your profile + add your first memory during signup.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
