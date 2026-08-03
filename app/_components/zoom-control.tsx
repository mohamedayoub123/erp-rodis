"use client";

import { useEffect, useState } from "react";

const ZOOM_LEVELS = [100, 75, 50, 25];
const STORAGE_KEY = "erp_zoom_level";

function applyZoom(value: number) {
  document.documentElement.style.zoom = `${value}%`;
}

// Zoom de tout le site, garde en memoire dans ce navigateur (localStorage)
// pour que chaque utilisateur retrouve sa taille preferee a la prochaine
// connexion. La propriete CSS "zoom" reflow correctement le contenu
// (contrairement a transform: scale) - supportee par Chrome/Edge/Safari.
export function ZoomControl() {
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY) || "100");
    const value = ZOOM_LEVELS.includes(stored) ? stored : 100;
    setZoom(value);
    applyZoom(value);
  }, []);

  function handleChange(value: number) {
    setZoom(value);
    applyZoom(value);
    window.localStorage.setItem(STORAGE_KEY, String(value));
  }

  return (
    <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
      <span>Taille</span>
      <select
        value={zoom}
        onChange={(event) => handleChange(Number(event.target.value))}
        className="bg-transparent text-sm font-semibold text-slate-700 outline-none"
      >
        {ZOOM_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level}%
          </option>
        ))}
      </select>
    </label>
  );
}
