// Un groupe d'import n'a pas d'id stocke - identifie par la paire
// (doss. 4D, doss. ERP), encodee ici pour servir de segment d'URL.
const SEPARATOR = "|||";

export function encodeDossierId(nDoss4d: string | null, nDossErp: string | null) {
  const raw = `${nDoss4d ?? ""}${SEPARATOR}${nDossErp ?? ""}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

export function decodeDossierId(id: string) {
  const raw = Buffer.from(id, "base64url").toString("utf8");
  const separatorIndex = raw.indexOf(SEPARATOR);

  if (separatorIndex === -1) {
    return { nDoss4d: null as string | null, nDossErp: null as string | null };
  }

  const nDoss4d = raw.slice(0, separatorIndex);
  const nDossErp = raw.slice(separatorIndex + SEPARATOR.length);

  return {
    nDoss4d: nDoss4d || null,
    nDossErp: nDossErp || null,
  };
}
