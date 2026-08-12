"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

// Empeche le double-clic sur "Enregistrer" (formulaire natif <form
// action={...}>) de creer 2 fois la meme ligne - useFormStatus() lit l'etat
// du <form> ancetre le plus proche, donc ce bouton doit toujours etre rendu
// A L'INTERIEUR du formulaire qu'il soumet.
export function SubmitButton({
  children,
  pendingLabel = "...",
  className,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
