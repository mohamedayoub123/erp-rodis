"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

// Meme principe que DeleteGroupButton : appelle l'action directement (au
// lieu d'un <form action={...}> natif) pour pouvoir lire son resultat.
// L'action retourne { ok:false, message } pour les cas attendus au lieu de
// "throw" - un message jete depuis une Server Action est REDUIT au texte
// generique par Next en production meme attrape cote client, seule une
// valeur de retour normale laisse passer le vrai texte (bug reel signale :
// "Dispatch" affichait la page d'erreur generique). La navigation vers
// /ravitailleur-par-ligne se fait ici (cote client) une fois ok:true recu,
// l'action elle-meme ne redirige plus.
export function DispatchGroupButton({
  groupeId,
  dispatchAction,
}: {
  groupeId: number;
  dispatchAction: (formData: FormData) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("groupe_id", String(groupeId));
      const result = await dispatchAction(formData);
      if (!result.ok) {
        window.alert(result.message);
        return;
      }
      router.push("/ravitailleur-par-ligne");
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-full bg-emerald-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
    >
      {isPending ? "Dispatch..." : "Dispatch"}
    </button>
  );
}
