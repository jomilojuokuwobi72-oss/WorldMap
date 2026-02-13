"use client";

import React from "react";

export default function HeroGlobe({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      {/* soft outer glow */}
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.12),transparent_60%)] blur-2xl" />

      {/* globe */}
      <svg
        viewBox="0 0 200 200"
        className="relative mx-auto block h-full w-full text-white/90"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* outer sphere */}
        <circle
          cx="100"
          cy="100"
          r="82"
          stroke="currentColor"
          strokeWidth="2.5"
          opacity="0.9"
        />

        {/* equator */}
        <path
          d="M18 100h164"
          stroke="currentColor"
          strokeWidth="1.6"
          opacity="0.5"
        />

        {/* vertical meridian */}
        <path
          d="M100 18c24 22 38 50 38 82s-14 60-38 82c-24-22-38-50-38-82s14-60 38-82Z"
          stroke="currentColor"
          strokeWidth="1.6"
          opacity="0.55"
        />

        {/* latitude lines */}
        <path
          d="M34 70c22 6 44 9 66 9s44-3 66-9"
          stroke="currentColor"
          strokeWidth="1.4"
          opacity="0.4"
        />
        <path
          d="M34 130c22-6 44-9 66-9s44 3 66 9"
          stroke="currentColor"
          strokeWidth="1.4"
          opacity="0.4"
        />

        {/* subtle inner shading */}
        <defs>
          <radialGradient id="globeShade" cx="35%" cy="30%">
            <stop offset="0%" stopColor="white" stopOpacity="0.12" />
            <stop offset="60%" stopColor="white" stopOpacity="0.02" />
            <stop offset="100%" stopColor="black" stopOpacity="0.35" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="81" fill="url(#globeShade)" />

        {/* PIN ON TOP */}
        <g transform="translate(132 36)">
          <path
            d="M0 0c0 6-4 11-8 16-4-5-8-10-8-16a8 8 0 1 1 16 0Z"
            fill="currentColor"
            opacity="0.95"
          />
          <circle cx="0" cy="0" r="3" fill="white" opacity="0.95" />
        </g>
      </svg>

      {/* label */}
      <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-xs font-semibold tracking-wide text-white/90 backdrop-blur">
        MapMuse
      </div>

      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-white/55">
        Profile + pins + memories
      </div>
    </div>
  );
}
