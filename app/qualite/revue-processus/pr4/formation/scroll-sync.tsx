"use client";

import { useRef } from "react";

// Le tableau "Plan de formation" et le tableau "Bilan" sont 2 <table>
// separes, chacun avec son propre scroll horizontal - sans ca, scroller
// l'un pour voir un mois (ex: Aout) ne scrolle pas l'autre, et les colonnes
// des deux tableaux ne s'alignent plus visuellement (l'utilisateur regarde
// "Aout" dans un tableau mais un autre mois dans l'autre, juste en dessous).
// Synchronise leur scrollLeft via un groupKey partage - demande explicite,
// bug reel signale par l'utilisateur (Bilan montrait "0" sous "Aout" alors
// que les vraies donnees d'Aout etaient correctes, juste mal alignees).
export function ScrollSyncX({
  groupKey,
  className,
  children,
}: {
  groupKey: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const others = document.querySelectorAll<HTMLElement>(`[data-scroll-sync="${groupKey}"]`);
    others.forEach((other) => {
      if (other !== el && other.scrollLeft !== el.scrollLeft) other.scrollLeft = el.scrollLeft;
    });
  }

  return (
    <div ref={ref} data-scroll-sync={groupKey} onScroll={handleScroll} className={className}>
      {children}
    </div>
  );
}
