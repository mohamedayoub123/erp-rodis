"use client";

import { useTransition } from "react";

// Meme icone/confirmation que DeleteIconButton, mais appelle l'action
// directement (au lieu d'un <form action={...}> natif) pour pouvoir lire son
// resultat. L'action retourne { ok:false, message } pour les cas attendus
// (permission, tracabilite restante...) au lieu de "throw" - un message jete
// depuis une Server Action est REDUIT au texte generique par Next en
// production meme attrape cote client, seule une valeur de retour normale
// laisse passer le vrai texte ("il reste encore des rapports de
// production...").
export function DeleteGroupButton({
  groupeId,
  deleteAction,
}: {
  groupeId: number;
  deleteAction: (formData: FormData) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("Supprimer ce programme ? Cette action est definitive.")) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("groupe_id", String(groupeId));
      const result = await deleteAction(formData);
      if (result && !result.ok) {
        window.alert(result.message || "Erreur lors de la suppression.");
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
