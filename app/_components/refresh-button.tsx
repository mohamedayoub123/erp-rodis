"use client";

import { useRouter } from "next/navigation";

export function RefreshButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      aria-label="Actualiser"
      title="Actualiser"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:border-slate-400"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  );
}
