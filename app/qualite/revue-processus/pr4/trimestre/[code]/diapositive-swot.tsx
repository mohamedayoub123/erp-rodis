import { BLEU_TITRE, POLICE } from "./diapositive";
import { GROUPES_SWOT, type LigneSwot } from "./swot-donnees";

// Diapositives SWOT : un seul tableau (forces, faiblesses, menaces, opportunites), le meme pour tous les trimestres.
const cellule = "border border-black px-2 py-2 align-middle text-center";

function Numero({ numero }: { numero: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {String(numero)
        .split("")
        .map((chiffre, index) => (
          <span
            key={index}
            className="inline-flex h-[18px] w-[18px] items-center justify-center border border-slate-800 text-[11px] font-bold leading-none"
          >
            {chiffre}
          </span>
        ))}
    </span>
  );
}

function Ligne({ ligne, fond, groupe }: { ligne: LigneSwot; fond: string; groupe: React.ReactNode }) {
  return (
    <tr style={{ backgroundColor: fond }}>
      <td className={`${cellule} w-[4%]`}>
        <Numero numero={ligne.numero} />
      </td>
      {groupe}
      <td className={`${cellule} w-[17%] ${ligne.themeGras ? "font-bold" : ""}`}>{ligne.theme}</td>
      <td className={`${cellule} w-[17%]`}>{ligne.description}</td>
      <td className={`${cellule} w-[9%]`}>{ligne.objectif}</td>
      <td className={`${cellule} w-[22%]`}>
        {ligne.actions.map((action) => (
          <p key={action}>{action}</p>
        ))}
      </td>
      <td className={`${cellule} w-[15%]`}>
        {ligne.outils.map((outil) => (
          <p key={outil}>{outil}</p>
        ))}
      </td>
    </tr>
  );
}

export function DiapositiveSwot() {
  const entete = "border border-black bg-[#808080] px-2 py-3 text-center text-lg font-bold text-white";
  return (
    <section className="rounded-[1.75rem] border border-black/5 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
      <h2 className="text-center text-6xl font-light" style={{ color: BLEU_TITRE, fontFamily: POLICE }}>
        SWOT
      </h2>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-[13px] leading-snug text-slate-900">
          <thead>
            <tr>
              <th className={entete}>#</th>
              <th className={entete}>SWOT</th>
              <th className={entete}>Theme</th>
              <th className={entete}>Description</th>
              <th className={entete}>☑ Objectif :</th>
              <th className={entete}>⚑ Actions à mettre en place :</th>
              <th className={entete}>⚒ Outils :</th>
            </tr>
          </thead>
          <tbody>
            {GROUPES_SWOT.flatMap((groupe) =>
              groupe.lignes.map((ligne, index) => (
                <Ligne
                  key={ligne.numero}
                  ligne={ligne}
                  fond={groupe.fond}
                  groupe={
                    index === 0 ? (
                      <td rowSpan={groupe.lignes.length} className={`${cellule} w-[7%] ${groupe.libelleGras ? "font-bold" : ""}`}>
                        {groupe.libelle.map((texte) => (
                          <p key={texte}>{texte}</p>
                        ))}
                      </td>
                    ) : null
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
