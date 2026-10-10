import { CONDITIONNEMENTS } from "@/lib/contenance-mp";

// Contenance (nombre, TOUJOURS en kg) et, a cote, le type dans une liste fixe : Sac, Fut, Barrique. Meme composant pour
// l'article et pour la reception d'un import. Les champs envoyes sont "contenance" et "conditionnement".
export function ChampsContenance({
  contenance,
  conditionnement,
  avecType,
  requis = false,
  classeChamp,
}: {
  contenance?: number | null;
  conditionnement?: string | null;
  // faux tant que le SQL add_conditionnement_mp.sql n'est pas execute : seul le nombre est demande
  avecType: boolean;
  requis?: boolean;
  classeChamp: string;
}) {
  return (
    <div className={`grid gap-2 ${avecType ? "grid-cols-2" : "grid-cols-1"}`}>
      <input
        type="number"
        step="0.001"
        min="0.001"
        name="contenance"
        defaultValue={contenance ?? undefined}
        placeholder="kg (ex : 25)"
        aria-label="Contenance en kg"
        required={requis}
        className={classeChamp}
      />
      {avecType ? (
        <select
          name="conditionnement"
          defaultValue={conditionnement ?? ""}
          aria-label="Type : sac, fut ou barrique"
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
