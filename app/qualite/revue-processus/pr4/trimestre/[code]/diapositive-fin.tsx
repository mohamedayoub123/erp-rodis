import { Diapositive } from "./diapositive";

// Derniere diapositive du rapport : remerciements et auteur (texte de la diapositive d'origine).
const TEXTE = "#404040";
const PUCE = "#4472c4";

function Puce() {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: 0, height: 0, borderTop: "0.55cqw solid transparent", borderBottom: "0.55cqw solid transparent", borderLeft: "0.9cqw solid " + PUCE, marginRight: "1.8cqw" }}
    />
  );
}

export function DiapositiveFin() {
  return (
    <Diapositive variante="contenu">
      <p className="absolute" style={{ left: "3.7%", top: "4.8%", fontSize: "2.1cqw", color: "#111111" }}>
        Fin de la presentation
      </p>
      <p className="absolute flex items-center" style={{ left: "5.6%", top: "22%", fontSize: "2.1cqw", color: TEXTE }}>
        <Puce />
        Merci de votre attention
      </p>
      <div className="absolute" style={{ left: "5.6%", top: "80%", fontSize: "2.1cqw", color: TEXTE }}>
        <p className="flex items-center">
          <Puce />
          Realise par:
        </p>
        <p style={{ marginLeft: "2.7cqw", marginTop: "0.8cqw" }}>Ayoub Mohamed</p>
      </div>
    </Diapositive>
  );
}
