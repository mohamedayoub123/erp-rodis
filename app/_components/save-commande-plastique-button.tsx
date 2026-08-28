"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

// "Save" a part (pas un simple <form action=...>) pour pouvoir attraper
// l'erreur "aucun avis rempli" et suivre la redirection renvoyee par
// l'action - meme motif que DispatchGroupButton/AddArticleRow ailleurs
// dans l'appli (un throw brut depuis un Server Action affiche la page
// d'erreur generique Next.js au lieu du vrai message).
export function SaveCommandeButton({
  saveAction,
}: {
  saveAction: () => Promise<{ ok: true; href: string } | { ok: false; message: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const result = await saveAction();
      if (result.ok) {
        router.push(result.href);
      } else {
        window.alert(result.message);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-60"
    >
      {isPending ? "Enregistrement..." : "Save"}
    </button>
  );
}
