"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight, MapPin, Lock, Link2, Images } from "lucide-react";

import MapboxMap from "@/components/MapboxMap";
import WorldMapLogo from "@/components/worldMapLogo";

type Polaroid = {
  src: string;
  alt: string;
  location: string;
  note: string;
  rotate: string;
  drift: string;
};

export default function HomePage() {
  const router = useRouter();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setEntered(true));
  }, []);

  const base15 = useMemo(
    () => [
      { src: "/preview1.jpeg", alt: "Preview 1", location: "Dallas, TX", note: "Window seat clouds" },
      { src: "/preview2.jpeg", alt: "Preview 2", location: "Austin, TX", note: "Weekend stroll" },
      { src: "/preview3.jpeg", alt: "Preview 3", location: "Coffee stop", note: "Late-night latte" },
      { src: "/preview4.jpeg", alt: "Preview 4", location: "Chicago, IL", note: "Cold air, warm vibes" },
      { src: "/preview5.jpeg", alt: "Preview 5", location: "San Diego, CA", note: "Sunset by the water" },
      { src: "/preview6.jpeg", alt: "Preview 6", location: "NYC", note: "Night lights + subway" },
      { src: "/preview7.jpeg", alt: "Preview 7", location: "Seattle, WA", note: "Rainy walk" },
      { src: "/preview8.jpeg", alt: "Preview 8", location: "Houston, TX", note: "City bites" },
      { src: "/preview9.jpeg", alt: "Preview 9", location: "Miami, FL", note: "Ocean air" },
      { src: "/preview10.jpeg", alt: "Preview 10", location: "Denver, CO", note: "Mountain day" },
      { src: "/preview11.jpeg", alt: "Preview 11", location: "Los Angeles, CA", note: "Golden hour" },
      { src: "/preview12.jpeg", alt: "Preview 12", location: "Boston, MA", note: "Bookstore stop" },
      { src: "/preview13.jpeg", alt: "Preview 13", location: "New Orleans, LA", note: "Jazz night" },
      { src: "/preview14.jpeg", alt: "Preview 14", location: "Phoenix, AZ", note: "Desert drive" },
      { src: "/preview15.jpeg", alt: "Preview 15", location: "Portland, OR", note: "Coffee + thrift" },
    ],
    [],
  );

  const tiles: Polaroid[] = useMemo(() => {
    const rotations = ["-rotate-8", "rotate-7", "-rotate-6", "rotate-8", "-rotate-7"];
    const drifts = ["md:-translate-y-2", "md:translate-y-2", "md:-translate-y-1", "md:translate-y-1", ""];
    return base15.map((b, i) => ({
      ...b,
      rotate: rotations[i % rotations.length],
      drift: drifts[i % drifts.length],
    }));
  }, [base15]);

  const headlineClass =
    "text-balance text-4xl font-semibold leading-[0.98] tracking-tight sm:text-5xl md:text-6xl";

  return (
    <main className="min-h-[100svh] w-full bg-black text-white">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <MapboxMap />
        <div className="absolute inset-0 bg-black/80" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_30%,rgba(255,255,255,0.10),transparent_44%),radial-gradient(circle_at_70%_60%,rgba(255,255,255,0.06),transparent_55%)]" />
      </div>

      <div className="mx-auto flex min-h-[100svh] max-w-7xl flex-col px-5 sm:px-6">
        {/* Nav */}
        <header className="flex items-center justify-between py-5 sm:py-6">
          <button onClick={() => router.push("/")} aria-label="Home">
            <WorldMapLogo className="text-white" />
          </button>

          <nav className="flex items-center gap-2 text-sm text-white/70">
            <button className="rounded-full px-3 py-2 hover:bg-white/5 hover:text-white">Home</button>
            <button className="rounded-full px-3 py-2 hover:bg-white/5 hover:text-white">About</button>

            {/* ✅ NEW: Login link */}
            <button
              onClick={() => router.push("/login")}
              className="rounded-full px-3 py-2 hover:bg-white/5 hover:text-white"
            >
              Login
            </button>

            <button
              onClick={() => router.push("/signup")}
              className="ml-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black hover:opacity-90"
            >
              Join
            </button>
          </nav>
        </header>

        {/* Content */}
        <section className="grid flex-1 items-start gap-10 pb-10 pt-6 sm:pt-10 md:grid-cols-2 md:gap-16 lg:gap-24">
          {/* LEFT */}
          <div className="pt-2 sm:pt-6 md:pt-14">
            <h1 className={headlineClass}>
              Your memories,
              <br />
              pinned to the world
            </h1>

            <p className="mt-5 max-w-md text-pretty text-sm leading-6 text-white/70 sm:text-base">
              Build a personal map of places you’ve been and moments you want to remember.
              Share a single link with friends — or keep it private.
            </p>

            <ul className="mt-6 grid max-w-md gap-3 text-sm text-white/75">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                  <MapPin size={16} />
                </span>
                <div>
                  <div className="font-semibold text-white">Drop pins anywhere</div>
                  <div className="text-white/60">Save the place + the moment behind it.</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                  <Images size={16} />
                </span>
                <div>
                  <div className="font-semibold text-white">Add photos + quick notes</div>
                  <div className="text-white/60">Short, visual, searchable memories.</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                  <Link2 size={16} />
                </span>
                <div>
                  <div className="font-semibold text-white">Share one clean link</div>
                  <div className="text-white/60">Send your map in seconds.</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                  <Lock size={16} />
                </span>
                <div>
                  <div className="font-semibold text-white">Public or private</div>
                  <div className="text-white/60">You control visibility.</div>
                </div>
              </li>
            </ul>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                onClick={() => router.push("/signup")}
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:opacity-90"
              >
                Join
                <ArrowRight size={16} />
              </button>

              {/* ✅ Optional: secondary login CTA */}
              <button
                onClick={() => router.push("/login")}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                Login
              </button>
            </div>
          </div>

          {/* RIGHT */}
          <div className="pt-0 sm:pt-2 md:pt-14">
            <h2 className={headlineClass}>Pin memories on the map</h2>

            <div className="mt-8 grid grid-cols-3 gap-5 sm:grid-cols-5">
              {tiles.map((p, idx) => (
                <div
                  key={idx}
                  className={[
                    "rounded-2xl bg-white/[0.06] p-2 shadow-xl backdrop-blur",
                    "transition-all duration-500 ease-out",
                    entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
                    "hover:-translate-y-2 hover:rotate-0",
                    p.rotate,
                    p.drift,
                  ].join(" ")}
                  style={{ transitionDelay: `${idx * 25}ms` }}
                >
                  <div className="relative aspect-square overflow-hidden rounded-xl">
                    <Image src={p.src} alt={p.alt} fill className="object-cover" sizes="110px" />
                  </div>
                  <div className="px-0.5 pt-2">
                    <div className="text-[11px] font-semibold text-white">{p.location}</div>
                    <div className="text-[10px] text-white/55">{p.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="pb-6 text-xs text-white/40">© {new Date().getFullYear()} worldmap</footer>
      </div>
    </main>
  );
}