import Anthropic from "@anthropic-ai/sdk";

// Lecture de la photo d'un Transfer Order d'un autre systeme par Claude (vision) :
// l'IA ne fait que RECOPIER ce qui est ecrit (depots, date, lignes nom + quantite).
// Rien n'est cree sans que l'utilisateur ait verifie la liste.

export type ExtractionPhotoTo = {
  depotSource: string | null;
  depotDestination: string | null;
  date: string | null;
  numeroDocument: string | null;
  lignes: { nom: string; quantite: number | null; unite: string | null }[];
};

const MODELE_LECTURE = process.env.ANTHROPIC_MODEL_PHOTO_TO || "claude-opus-5-5";

// Reponse demandee en JSON simple (sans mode "outil force" : certains modeles le refusent) ;
// la reponse est ensuite relue et verifiee champ par champ.
const CONSIGNES = `Tu lis la photo d'un document de transfert de stock (Transfer Order / bon de transfert) venant d'un autre logiciel.
Recopie fidelement ce qui est ecrit : ne devine rien et n'invente aucune ligne.
La photo peut avoir ete prise au telephone : document un peu penche, tourne d'un quart de tour, avec des reflets ou une perspective. Lis-la quand meme, en remettant mentalement le texte droit.

Reponds UNIQUEMENT avec un objet JSON, sans aucun texte avant ou apres, de cette forme :
{
  "depot_source": string ou null,
  "depot_destination": string ou null,
  "date": string ou null,
  "numero_document": string ou null,
  "lignes": [ { "nom": string, "quantite": nombre ou null, "unite": string ou null } ]
}

- depot_source / depot_destination : les depots "de" et "vers" tels qu'ecrits (ex: "Depot B"), null s'ils ne sont pas visibles.
- date : la date du document au format AAAA-MM-JJ, null si absente.
- numero_document : le numero du TO s'il est visible, sinon null.
- lignes : une entree par article, avec le nom EXACTEMENT comme ecrit (ne le corrige pas, ne le traduis pas) et la quantite demandee/transferee.
- Quantites : un espace ou un point entre des groupes de 3 chiffres separe les milliers (1 200 ou 1.200 = 1200) ; la virgule est le separateur decimal. Si une quantite est illisible, mets null.
- Ignore les lignes de total, les en-tetes et les lignes vides.`;

// Prend le premier objet JSON de la reponse (au cas ou le modele l'entoure d'un bloc de code)
function extraireJson(texte: string): unknown {
  const debut = texte.indexOf("{");
  const fin = texte.lastIndexOf("}");
  if (debut === -1 || fin <= debut) throw new Error("reponse de l'IA illisible");
  return JSON.parse(texte.slice(debut, fin + 1));
}

export async function lireTransferOrderSurPhoto(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<ExtractionPhotoTo> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("CLE_ANTHROPIC_ABSENTE");

  const client = new Anthropic({ apiKey });

  const reponse = await client.messages.create({
    model: MODELE_LECTURE,
    max_tokens: 8000,
    system: CONSIGNES,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: "Lis ce Transfer Order et reponds avec le JSON demande." },
        ],
      },
    ],
  });

  if (reponse.stop_reason === "max_tokens") {
    throw new Error("la liste est trop longue pour etre lue en une fois");
  }

  const texteReponse = reponse.content.map((bloc) => (bloc.type === "text" ? bloc.text : "")).join("");

  let brut: {
    depot_source?: unknown;
    depot_destination?: unknown;
    date?: unknown;
    numero_document?: unknown;
    lignes?: { nom?: unknown; quantite?: unknown; unite?: unknown }[];
  };
  try {
    brut = extraireJson(texteReponse) as typeof brut;
  } catch {
    throw new Error("reponse de l'IA illisible");
  }

  const texte = (valeur: unknown): string | null =>
    typeof valeur === "string" && valeur.trim() !== "" ? valeur.trim() : null;

  return {
    depotSource: texte(brut.depot_source),
    depotDestination: texte(brut.depot_destination),
    date: texte(brut.date),
    numeroDocument: texte(brut.numero_document),
    lignes: (Array.isArray(brut.lignes) ? brut.lignes : [])
      .map((l) => ({
        nom: texte(l?.nom) ?? "",
        quantite: typeof l?.quantite === "number" && Number.isFinite(l.quantite) ? l.quantite : null,
        unite: texte(l?.unite),
      }))
      .filter((l) => l.nom !== ""),
  };
}
