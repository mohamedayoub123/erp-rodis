"use client";

import { SubmitButton } from "@/app/_components/submit-button";

type LigneAugmentable = {
  id: number;
  nom: string;
  articleType: "MP" | "PF";
  demandee: number;
  livree: number;
};

function nombre(valeur: number) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

// Transfer Order deja traite (approuve, partiellement fini ou poste) : on peut seulement AUGMENTER la quantite
// demandee d'une ligne - jamais la diminuer. Le supplement est reserve sur le stock du depot source et part dans un
// nouveau Transfer Invoice (bouton "Poster a Transfer Invoice").
export function AugmenterQuantitesTo({
  transferOrderId,
  lignes,
  action,
}: {
  transferOrderId: number;
  lignes: LigneAugmentable[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <details className="group overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-sky-700 marker:content-none">
        + Augmenter la quantité demandée
      </summary>
      <form action={action} className="grid gap-4 border-t border-slate-100 px-5 py-4">
        <input type="hidden" name="transfer_order_id" value={transferOrderId} />
        <p className="text-sm text-slate-600">
          Tu peux seulement <span className="font-semibold">augmenter</span> la quantité demandée (jamais la diminuer). La
          quantité en plus est réservée tout de suite sur le stock du dépôt source (lot le plus proche de l&apos;expiration
          en premier), puis livrée avec un nouveau Transfer Invoice : clique ensuite sur « Poster à Transfer Invoice ».
          Si le stock ne suffit pas, rien n&apos;est enregistré.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Article</th>
                <th className="px-4 py-3 font-semibold">Demandé</th>
                <th className="px-4 py-3 font-semibold">Déjà livré</th>
                <th className="px-4 py-3 font-semibold">Nouvelle quantité demandée</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => (
                <tr key={ligne.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {ligne.nom}{" "}
                    <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {ligne.articleType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{nombre(ligne.demandee)}</td>
                  <td className="px-4 py-3 text-slate-700">{nombre(ligne.livree)}</td>
                  <td className="px-4 py-3">
                    <input type="hidden" name="ligne_id" value={ligne.id} />
                    <input
                      type="number"
                      name="nouvelle_quantite"
                      min={ligne.demandee}
                      step="any"
                      defaultValue={ligne.demandee}
                      className="w-40 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <SubmitButton
            pendingLabel="Enregistrement..."
            className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
          >
            Enregistrer l&apos;augmentation
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}
