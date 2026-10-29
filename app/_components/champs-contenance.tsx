import { CONDITIONNEMENTS, uniteContenance } from "@/lib/contenance-mp";

// Contenance (nombre) et, a cote, le type dans une liste fixe : Sac, Fut, Barrique, Carton, Bidon. Le nombre est en kg, ou en
// PIECES pour un article compte a la piece (cartons, articles de conditionnement : unite pcs). Meme composant pour
// l'article et pour la reception d'un import. Les champs envoyes sont "contenance" et "conditionnement".
export function ChampsContenance({
  contenance,
  conditionnement,
  avecType,
  unite,
  requis = false,
  classeChamp,
}: {
  contenance?: number | null;
  conditionnement?: string | null;
  // faux tant que le SQL add_conditionnement_mp.sql n'est pas execute : seul le nombre est demande
  avecType: boolean;
  // unite de l'article (ex : "pcs", "kg"). Non fournie (nouvel article, unite pas encore choisie) : "kg ou pieces".
  unite?: string | null;
  requis?: boolean;
  classeChamp: string;
}) {
  const libelleUnite = unite === undefined ? "kg ou pièces" : uniteContenance(unite);
  const exemple = unite !== undefined && uniteContenance(unite) === "pièces" ? "1000" : "25";
  return (
    <div className={`grid gap-2 ${avecType ? "grid-cols-2" : "grid-cols-1"}`}>
      <input
        type="number"
        step="0.001"
        min="0.001"
        name="contenance"
        defaultValue={contenance ?? undefined}
        placeholder={`${libelleUnite} (ex : ${exemple})`}
        aria-label={`Contenance en ${libelleUnite}`}
        required={requis}
        className={classeChamp}
      />
      {avecType ? (
        <select
          name="conditionnement"
          defaultValue={conditionnement ?? ""}
          aria-label="Type : sac, fût, barrique, carton ou bidon"
          required={requis}
          className={classeChamp}
        >
          <option value="">Type...</option>
          {CONDITIONNEMENTS.map((type) => (
            <option key={type.code} value={type.code}>
              {type.libelle}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
