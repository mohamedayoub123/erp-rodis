import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { trouverTrimestrePr4 } from "@/lib/trimestres-pr4";
import { construireRevuePptx } from "../exporter-pptx";

// Telechargement du PowerPoint du rapport de revue de processus d'un trimestre (meme droit que la page :
// qualiteRevueProcessus). Le calcul des indicateurs prend quelques secondes.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_requete: Request, { params }: { params: Promise<{ code: string }> }) {
  const utilisateur = await getCurrentStockUser();
  if (!(await canViewPageUser(utilisateur, "qualiteRevueProcessus"))) {
    return new Response("Acces refuse.", { status: 403 });
  }

  const { code } = await params;
  const trimestre = trouverTrimestrePr4(code);
  if (!trimestre) {
    return new Response("Trimestre introuvable.", { status: 404 });
  }

  try {
    const fichier = await construireRevuePptx(trimestre);
    return new Response(new Uint8Array(fichier), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="Revue-processus-PR4-${trimestre.annee}-T${trimestre.trimestre}.pptx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur pendant la creation du PowerPoint.";
    return new Response(`Impossible de creer le PowerPoint : ${message}`, { status: 500 });
  }
}
