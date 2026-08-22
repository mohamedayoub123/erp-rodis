"use client";

import { useTransition } from "react";
import { unstable_rethrow } from "next/navigation";

// Meme icone/confirmation que DeleteIconButton, mais appelle l'action
// directement (au lieu d'un <form action={...}> natif) pour pouvoir attraper
// le message d'erreur cote client. Un <form> natif fait planter toute la
// page sur la boundary generique de Next ("Une erreur s'est produite", texte
// sans le vrai message) quand l'action rejette - ici le blocage legitime
// ("il reste encore des rapports de production...") s'affiche enfin.
export function DeleteGroupButton({
  groupeId,
  deleteAction,
}: {
  groupeId: number;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("Supprimer ce programme ? Cette action est definitive.")) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("groupe_id", String(groupeId));
      try {
        await deleteAction(formData);
      } catch (error) {
        // redirect() de l'action reussie passe aussi par un throw interne -
        // le laisser filer sinon la redirection vers la liste ne se fait
        // jamais et le succes ressemble a une erreur.
        unstable_rethrow(error);
        window.alert(error instanceof Error ? error.message : "Erreur lors de la suppression.");
      }
    });
  }

  return (
    <button
      type="button"
      aria-label="Supprimer"
      title="Supprimer"
      onClick={handleClick}
      disabled={isPending}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-700 transition hover:bg-red-50 disabled:opacity-50"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    </button>
  );
}
