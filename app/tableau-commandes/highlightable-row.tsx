"use client";

import { useState } from "react";

// Clic sur une ligne = allume/eteint un surlignage fort qui ecrase la
// couleur de fond de chaque cellule (peu importe si elle etait deja jaune
// "manque", verte "bl transforme"...) - purement visuel, cote client, ne
// persiste pas au rechargement (sert juste a suivre ou on en est en
// parcourant un tableau tres long).
export function HighlightableRow({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);

  return (
    <tr
      onClick={() => setActive((prev) => !prev)}
      className={`cursor-pointer ${active ? "[&>td]:!bg-blue-200 [&>td]:!text-blue-950" : ""}`}
    >
      {children}
    </tr>
  );
}
