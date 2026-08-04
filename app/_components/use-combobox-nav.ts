"use client";

import { useState } from "react";

// Permet de naviguer une liste de suggestions (article, lot...) avec les
// fleches haut/bas + Entree pour choisir, en plus du clic - jusqu'ici ces
// menus ne se pilotaient qu'a la souris ou au Tab (qui saute la liste sans
// rien choisir).
export function useComboboxNav<T>(items: T[], onSelect: (item: T) => void) {
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (items.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => (current - 1 + items.length) % items.length);
    } else if (event.key === "Enter") {
      const item = items[highlightedIndex];
      if (item) {
        event.preventDefault();
        onSelect(item);
      }
    }
  }

  return { highlightedIndex, setHighlightedIndex, handleKeyDown };
}
