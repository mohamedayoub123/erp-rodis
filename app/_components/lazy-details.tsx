"use client";

import { useState, type ReactNode } from "react";

// Meme balisage/style qu'un <details><summary> natif, mais les enfants ne
// sont montes qu'a la PREMIERE ouverture (et restent montes ensuite, pour
// ne pas perdre une saisie en cours) - pour les sections repliees par
// defaut dont le contenu a un cout reel (ex: recupere sa propre liste
// d'articles au montage), evite de payer ce cout tant que l'utilisateur n'a
// jamais ouvert la section.
export function LazyDetails({
  summary,
  children,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [hasOpened, setHasOpened] = useState(false);

  return (
    <details
      className={className}
      onToggle={(event) => {
        if (event.currentTarget.open) setHasOpened(true);
      }}
    >
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">{summary}</summary>
      {hasOpened ? children : null}
    </details>
  );
}
