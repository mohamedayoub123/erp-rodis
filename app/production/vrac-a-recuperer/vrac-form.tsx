"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MAX_LIGNES_VRAC_A_RECUPERER, lireQuantite, type ArticleVrac } from "@/lib/vrac-a-recuperer";
import { ajouterVracARecupererAction } from "./actions";

type Ligne = { article: string; code: string; quantite: string; remarque: string };

const LIGNE_VIDE: Ligne = { article: "", code: "", quantite: "", remarque: "" };

const CHAMP =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-600";

// Chaque ligne = un article vrac + le code de son lot + la quantite a faire
// entrer dans le Depot B. L'article se choisit dans la liste (nom exact).
export function VracForm({ articles }: { articles: ArticleVrac[] }) {
  const router = useRouter();
  const listeId = useId();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }]);
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const articleParNom = new Map(articles.map((a) => [a.nom, a.id]));

  function maj(index: number, champ: keyof Ligne, valeur: string) {
    setMessage(null);
    setLignes((ls) => ls.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  }

  function ajouterLigne() {
    setMessage(null);
    setLignes((ls) => (ls.length >= MAX_LIGNES_VRAC_A_RECUPERER ? ls : [...ls, { ...LIGNE_VIDE }]));
  }

  function retirerLigne(index: number) {
    setMessage(null);
    setLignes((ls) => (ls.length <= 1 ? [{ ...LIGNE_VIDE }] : ls.filter((_, i) => i !== index)));
  }

  function enregistrer() {
    setMessage(null);

    const remplies = lignes.filter((l) => l.article.trim() !== "" || l.code.trim() !== "" || l.quantite.trim() !== "");
    if (remplies.length === 0) {
      setMessage({ type: "erreur", texte: "Remplis au moins une ligne (article, code, quantite)." });
      return;
    }

    for (const [i, l] of remplies.entries()) {
      const numero = i + 1;
      if (!articleParNom.has(l.article.trim())) {
        setMessage({ type: "erreur", texte: `Ligne ${numero} : choisis l'article vrac dans la liste proposee.` });
        return;
      }
      if (l.code.trim() === "") {
        setMessage({ type: "erreur", texte: `Ligne ${numero} : ecris le code du vrac.` });
        return;
      }
      const quantite = lireQuantite(l.quantite);
      if (quantite === null || quantite <= 0) {
        setMessage({ type: "erreur", texte: `Ligne ${numero} : la quantite doit etre superieure a 0.` });
        return;
      }
    }

    demarrer(async () => {
      try {
        const reponse = await ajouterVracARecupererAction(
          date,
          remplies.map((l) => ({
            articleId: articleParNom.get(l.article.trim()) ?? 0,
            code: l.code.trim(),
            quantite: lireQuantite(l.quantite),
            remarque: l.remarque.trim(),
          }))
        );
        if (!reponse.ok) {
          setMessage({ type: "erreur", texte: reponse.message });
          return;
        }
        setLignes([{ ...LIGNE_VIDE }]);
        setMessage({ type: "ok", texte: reponse.message });
        router.refresh();
      } catch {
        setMessage({ type: "erreur", texte: "Enregistrement impossible (session fermee ?). Recharge la page." });
      }
    });
  }

  return (
    <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <h2 className="text-lg font-bold text-slate-900">Nouveau vrac a recuperer</h2>
      <p className="mt-1 text-sm text-slate-600">
        Choisis l&apos;article vrac, ecris le code du vrac et sa quantite : le vrac entre dans le{" "}
        <span className="font-semibold">Depot B</span>. Ensuite, dans le rapport Fabrication, le code est propose dans{" "}
        <span className="font-semibold">Code vrac recupere</span> et la quantite utilisee est deduite de ce stock.
      </p>

      <label className="mt-4 grid max-w-56 gap-1 text-xs font-semibold text-slate-600">
        Date d&apos;entree
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-sky-600"
        />
      </label>

      <datalist id={listeId}>
        {articles.map((a) => (
          <option key={a.id} value={a.nom} />
        ))}
      </datalist>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1 font-semibold">Article vrac</th>
              <th className="px-2 py-1 font-semibold">Code du vrac</th>
              <th className="px-2 py-1 font-semibold">Quantite (kg)</th>
              <th className="px-2 py-1 font-semibold">Remarque</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, index) => {
              const articleValide = ligne.article.trim() === "" || articleParNom.has(ligne.article.trim());
              return (
                <tr key={index}>
                  <td className="min-w-72 px-2">
                    <input
                      type="text"
                      list={listeId}
                      value={ligne.article}
                      onChange={(e) => maj(index, "article", e.target.value)}
                      placeholder="Ecris pour chercher l'article vrac"
                      autoComplete="off"
                      className={`${CHAMP} ${articleValide ? "" : "border-amber-400"}`}
                    />
                  </td>
                  <td className="w-44 px-2">
                    <input
                      type="text"
                      value={ligne.code}
                      onChange={(e) => maj(index, "code", e.target.value)}
                      maxLength={60}
                      autoComplete="off"
                      className={CHAMP}
                    />
                  </td>
                  <td className="w-36 px-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={ligne.quantite}
                      onChange={(e) => maj(index, "quantite", e.target.value)}
                      className={CHAMP}
                    />
                  </td>
                  <td className="min-w-48 px-2">
                    <input
                      type="text"
                      value={ligne.remarque}
                      onChange={(e) => maj(index, "remarque", e.target.value)}
                      maxLength={200}
                      className={CHAMP}
                    />
                  </td>
                  <td className="px-2 text-right">
                    <button
                      type="button"
                      onClick={() => retirerLigne(index)}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={ajouterLigne}
        className="mt-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
      >
        + Ajouter une ligne
      </button>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={enregistrer}
          disabled={enCours}
          className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : "Mettre dans le stock Depot B"}
        </button>
        {message ? (
          <p className={`text-sm font-semibold ${message.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>
            {message.texte}
          </p>
        ) : null}
      </div>
    </section>
  );
}
