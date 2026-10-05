import Link from "next/link";
import { libelleMois } from "@/lib/cout-eau";

export type LigneHistoriqueMois = {
  annee: number;
  mois: number;
  // Nombre de valeurs saisies ce mois-la
  nombre: number;
  par: string | null;
  le: string;
};

// Liste des mois enregistres : chaque "Enregistrer" ajoute une ligne, un clic
// rouvre les valeurs de ce mois.
export function HistoriqueMois({
  lignes,
  choisi,
  basePath,
  libelleNombre,
  description = "Chaque Enregistrer ajoute une ligne. Clique sur un mois pour le revoir en entier.",
  libellePar = "Enregistre par",
  libelleLe = "Enregistre le",
}: {
  lignes: LigneHistoriqueMois[];
  choisi: { annee: number; mois: number };
  basePath: string;
  libelleNombre: string;
  description?: string;
  libellePar?: string;
  libelleLe?: string;
}) {
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-900">Mois enregistres</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>

      {lignes.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">Aucun mois enregistre pour le moment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-950">
              <tr>
                <th className="px-5 py-3 font-semibold">Mois</th>
                <th className="px-5 py-3 font-semibold">{libelleNombre}</th>
                <th className="px-5 py-3 font-semibold">{libellePar}</th>
                <th className="px-5 py-3 font-semibold">{libelleLe}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((m) => {
                const actif = m.annee === choisi.annee && m.mois === choisi.mois;
                return (
                  <tr key={`${m.annee}-${m.mois}`} className={`border-t border-slate-100 ${actif ? "bg-sky-50" : ""}`}>
                    <td className="px-5 py-3 font-semibold text-slate-900">{libelleMois(m.annee, m.mois)}</td>
                    <td className="px-5 py-3 text-slate-600">{m.nombre}</td>
                    <td className="px-5 py-3 text-slate-600">{m.par ?? "-"}</td>
                    <td className="px-5 py-3 text-slate-600">{m.le}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`${basePath}?annee=${m.annee}&mois=${m.mois}`} className="font-semibold text-sky-700 underline">
                        {actif ? "Affiche" : "Voir"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
