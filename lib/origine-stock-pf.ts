import { formatDocCode, type DocKind } from "@/lib/document-numbers";

// Page Stock produit fini, colonne "Vient de" : d'ou vient une ligne du stock, et la page qui montre ce document (clic = on y va directement,
// la ligne est surlignee). Calcul pur, sans acces a la base.

export type OrigineStock = { libelle: string; href: string | null };

type Ligne = {
  id: number;
  source_import: string | null;
  note: string | null;
  numero_lot: string | null;
};

// Les documents TE / "Entree Production" / TS de l'ERP : le numero est attribue au groupe de mouvement (voir app/mouvements/shared.ts)
const DOCUMENTS: Record<string, { kind: DocKind; page: "entrees" | "sorties"; libelle: string }> = {
  "web:entree-production": { kind: "EP", page: "entrees", libelle: "" },
  "web:entree": { kind: "TE", page: "entrees", libelle: "Entree manuelle " },
  "web:sortie": { kind: "TS", page: "sorties", libelle: "Sortie " },
  "web:sortie-commande": { kind: "TS", page: "sorties", libelle: "Livraison " },
};

export function documentDeLaSource(source: string | null): { kind: DocKind } | null {
  return source ? (DOCUMENTS[source] ?? null) : null;
}

const suiviDuCode = (code: string) => `/production/suivi-production?code=${encodeURIComponent(code)}`;

// groupe : numero du groupe de mouvement de la ligne (a defaut le numero de la ligne) ; numero : son numero de document s'il est deja attribue
export function origineLigneStock(ligne: Ligne, groupe: number, numero: { annee: number; numero: number } | null): OrigineStock {
  const source = ligne.source_import ?? "";
  const document = DOCUMENTS[source];
  if (document) {
    const code = numero ? formatDocCode(document.kind, numero) : document.kind === "EP" ? "Entree Production" : "";
    return {
      libelle: `${document.libelle}${code}`.trim(),
      href: `/mouvements/${document.page}/${groupe}?ligne=${ligne.id}#ligne-${ligne.id}`,
    };
  }
  const lot = (ligne.numero_lot ?? "").trim();
  if (source === "web:vrac-production") return { libelle: "Fabrication vrac", href: lot ? suiviDuCode(lot) : null };
  if (source === "web:fabrication-recuperation") {
    // note : "Recuperation vrac - ligne 8817 code GB1110" - le code de la fabrication qui a repris ce vrac
    const code = /code\s+(\S+)/i.exec(ligne.note ?? "")?.[1] ?? "";
    return { libelle: code ? `Recuperation vrac (code ${code})` : "Recuperation vrac", href: code ? suiviDuCode(code) : null };
  }
  if (source === "web:vrac-a-recuperer") return { libelle: "Vrac a recuperer", href: "/production/vrac-a-recuperer" };
  if (source === "web:inventaire-pf") return { libelle: "Inventaire", href: "/stock/inventaire" };
  if (source === "web:programme-plastique") return { libelle: "Programme plastique", href: "/production-plastique" };
  if (source && !source.startsWith("web:")) return { libelle: "Import Excel", href: null };
  return { libelle: source || "-", href: null };
}
