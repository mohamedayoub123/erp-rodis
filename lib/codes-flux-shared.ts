// Rapport Flux par Code : la liste de TOUS les codes (lots) des programmes proposee pendant la saisie (taper "AA" liste tous les codes AA).
// Calcul pur, sans acces a la base : partage entre le serveur et le champ de saisie.

// Les produits sont ranges a part pour ne pas repeter leur nom des milliers de fois
export type CodesPourRecherche = { produits: string[]; codes: [code: string, produit: number][] };

// Un code une seule fois (majuscules ou minuscules), ceux des programmes les plus RECENTS en premier (lignes recues de la plus ancienne a la
// plus recente) ; les codes d'un meme programme du plus grand numero au plus petit
export function rangerLesCodes(lignes: { numero_lot: string | null; produit: string | null }[]): CodesPourRecherche {
  const parCode = new Map<string, { code: string; produit: string; rang: number }>();
  lignes.forEach((ligne, rang) => {
    for (const morceau of (ligne.numero_lot ?? "").split(",")) {
      const code = morceau.trim();
      if (!code || code === "-") continue;
      parCode.set(code.toUpperCase(), { code, produit: (ligne.produit ?? "").trim(), rang });
    }
  });
  const produits: string[] = [];
  const indexProduit = new Map<string, number>();
  const codes = [...parCode.values()]
    .sort((a, b) => b.rang - a.rang || b.code.localeCompare(a.code, "fr", { numeric: true, sensitivity: "base" }))
    .map(({ code, produit }): [string, number] => {
      let index = indexProduit.get(produit);
      if (index === undefined) {
        index = produits.push(produit) - 1;
        indexProduit.set(produit, index);
      }
      return [code, index];
    });
  return { produits, codes };
}

// Les codes qui correspondent a ce qui est tape : d'abord ceux qui COMMENCENT par le texte, puis ceux qui le contiennent
export function filtrerCodes(codes: CodesPourRecherche["codes"], saisie: string): CodesPourRecherche["codes"] {
  const texte = saisie.trim().toUpperCase();
  if (!texte) return [];
  const debut: CodesPourRecherche["codes"] = [];
  const dedans: CodesPourRecherche["codes"] = [];
  for (const element of codes) {
    const position = element[0].toUpperCase().indexOf(texte);
    if (position === 0) debut.push(element);
    else if (position > 0) dedans.push(element);
  }
  return [...debut, ...dedans];
}
