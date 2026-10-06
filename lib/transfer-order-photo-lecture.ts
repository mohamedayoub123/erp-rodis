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

const OUTIL = "enregistrer_transfer_order";

const CONSIGNES = `Tu lis la photo d'un document de transfert de stock (Transfer Order / bon de transfert) venant d'un autre logiciel.
Recopie fidelement ce qui est ecrit : ne devine rien et n'invente aucune ligne.
- depot_source / depot_destination : les depots "de" et "vers" tels qu'ecrits (ex: "Depot B"), null s'ils ne sont pas visibles.
- date : la date du document au format AAAA-MM-JJ, null si absente.
- numero_document : le numero du TO s'il est visible, sinon null.
- lignes : une entree par article, avec le nom EXACTEMENT comme ecrit (ne le corrige pas, ne le traduis pas) et la quantite demandee/transferee.
- Quantites : un espace ou un point entre des groupes de 3 chiffres separe les milliers (1 200 ou 1.200 = 1200) ; la virgule est le separateur decimal. Si une quantite est illisible, mets null.
- Ignore les lignes de total, les en-tetes et les lignes vides.`;

export async function lireTransferOrderSurPhoto(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<ExtractionPhotoTo> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("CLE_ANTHROPIC_ABSENTE");

  const client = new Anthropic({ apiKey });

  const reponse = await client.messages.create({
    model: MODELE_LECTURE,
    max_tokens: 4096,
    system: CONSIGNES,
    tools: [
      {
        name: OUTIL,
        description: "Enregistre le contenu lu sur la photo du Transfer Order.",
        input_schema: {
          type: "object",
          properties: {
            depot_source: { type: ["string", "null"] },
            depot_destination: { type: ["string", "null"] },
            date: { type: ["string", "null"], description: "AAAA-MM-JJ" },
            numero_document: { type: ["string", "null"] },
            lignes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nom: { type: "string", description: "Nom de l'article exactement comme ecrit" },
                  quantite: { type: ["number", "null"] },
                  unite: { type: ["string", "null"] },
                },
                required: ["nom", "quantite"],
              },
            },
          },
          required: ["lignes"],
        },
      },
    ],
    tool_choice: { type: "tool", name: OUTIL },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: "Lis ce Transfer Order et enregistre son contenu." },
        ],
      },
    ],
  });

  const bloc = reponse.content.find((b) => b.type === "tool_use");
  if (!bloc || bloc.type !== "tool_use") throw new Error("Aucune lecture renvoyee pour cette photo.");

  const brut = bloc.input as {
    depot_source?: string | null;
    depot_destination?: string | null;
    date?: string | null;
    numero_document?: string | null;
    lignes?: { nom?: unknown; quantite?: unknown; unite?: unknown }[];
  };

  const texte = (valeur: unknown): string | null =>
    typeof valeur === "string" && valeur.trim() !== "" ? valeur.trim() : null;

  return {
    depotSource: texte(brut.depot_source),
    depotDestination: texte(brut.depot_destination),
    date: texte(brut.date),
    numeroDocument: texte(brut.numero_document),
    lignes: (brut.lignes ?? [])
      .map((l) => ({
        nom: texte(l.nom) ?? "",
        quantite: typeof l.quantite === "number" && Number.isFinite(l.quantite) ? l.quantite : null,
        unite: texte(l.unite),
      }))
      .filter((l) => l.nom !== ""),
  };
}
