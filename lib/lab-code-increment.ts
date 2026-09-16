// Format observe sur les vrais codes (code_auto/code_manu, et donc aussi
// lab_code_auto/lab_code_manu qui suivent la meme convention) : un prefixe de
// lettres, un numero (souvent complete de zeros), puis parfois une lettre de
// fin - ex "DA0525V", "CC0041", "ATA0213E". Incrementer garde le prefixe et
// le suffixe intacts, n'augmente que le numero (en gardant le meme nombre de
// chiffres tant que le numero ne deborde pas, ex "0041" -> "0042").
const CODE_PATTERN = /^([A-Za-z]+)(\d+)([A-Za-z]*)$/;

export function incrementLabCode(code: string): string | null {
  const match = CODE_PATTERN.exec(code.trim());
  if (!match) return null;

  const [, prefix, digits, suffix] = match;
  const nextNumber = String(Number(digits) + 1).padStart(digits.length, "0");
  return `${prefix}${nextNumber}${suffix}`;
}

// Genere `count` codes successifs a partir du dernier code connu (le premier
// code genere est deja +1, jamais le code de depart lui-meme).
export function generateSequentialLabCodes(startCode: string, count: number): string[] | null {
  const codes: string[] = [];
  let current = startCode;

  for (let i = 0; i < count; i++) {
    const next = incrementLabCode(current);
    if (!next) return null;
    codes.push(next);
    current = next;
  }

  return codes;
}
