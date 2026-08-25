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
  disabled = false,
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  // Condition metier independante (ex: validation incomplete) qui doit
  // bloquer l'envoi EN PLUS de la protection anti-double-clic - les 2 se
  // cumulent, jamais l'une a la place de l'autre.
  disabled?: boolean;
  // name/value optionnels du bouton lui-meme (pas un champ du formulaire) -
  // seul le bouton reellement clique voit sa paire name/value incluse dans
  // le FormData soumis (comportement natif HTML), utile pour distinguer
  // "quel bouton d'un meme formulaire" a declenche l'envoi (ex: valider une
  // seule ligne parmi plusieurs dans le meme <form>).
  name?: string;
  value?: string | number;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
