"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

// Bouton de soumission qui demande une confirmation oui/non avant d'envoyer
// le formulaire - meme principe que AnnulerInventaireButton/DeleteIconButton
// (toute action qui modifie ou fige durablement du stock doit d'abord
// demander confirmation), generalise pour les actions "a risque" qui ne
// sont ni une suppression ni une annulation (ex: regulariser ou ignorer un
// ecart d'inventaire).
export function ConfirmSubmitButton({
  children,
  pendingLabel = "...",
  confirmMessage,
  className,
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  confirmMessage: string;
  className?: string;
  name?: string;
  value?: string | number;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      className={className}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
