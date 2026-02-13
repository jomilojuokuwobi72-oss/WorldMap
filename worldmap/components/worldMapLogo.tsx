"use client";

import React from "react";

export default function WorldMapLogo({
  className = "",
  wordmark = "worldmap",
}: {
  className?: string;
  wordmark?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="2.5" />
        <path
          d="M6 32h52"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.8"
        />
        <path
          d="M32 6c9 7 14 16 14 26s-5 19-14 26c-9-7-14-16-14-26S23 13 32 6Z"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.8"
        />
        <path
          d="M12 22c6 2 13 3 20 3s14-1 20-3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M12 42c6-2 13-3 20-3s14 1 20 3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.75"
        />
        {/* tiny “pin” accent */}
        <path
          d="M46 18c0 3-2 6-4 8-2-2-4-5-4-8a4 4 0 1 1 8 0Z"
          fill="currentColor"
          opacity="0.9"
        />
        <circle cx="42" cy="18" r="1.4" fill="white" opacity="0.95" />
      </svg>

      <span className="text-sm font-semibold tracking-tight">{wordmark}</span>
    </div>
  );
}
