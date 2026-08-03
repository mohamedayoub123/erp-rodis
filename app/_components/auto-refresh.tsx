"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Force une donnee fraiche a chaque arrivee sur la page (y compris retour
// navigateur/onglet) - evite d'afficher une version en cache du Dashboard
// apres une action faite ailleurs (ex: sortie de stock produit fini dans
// Mouvements) qui ne revalide pas cette page directement.
export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    router.refresh();
  }, [router]);

  return null;
}
