"use client";

import { useRef } from "react";
import { formatDate } from "@/lib/format-date";

// Case a cocher auto-enregistree (meme principe que
// MachineTypeProduitSelect) - coche = pret dans le stock, decoche = pas
// encore. Toute la proforma (tous les camions freres) est marquee d'un coup
// cote serveur, voir togglePretStockAction.
export function PretStockToggle({
  numeroProforma,
  checked,
  date,
  action,
}: {
  numeroProforma: string;
  checked: boolean;
  date: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex shrink-0 items-center gap-1"
      title={checked && date ? `Pret en stock depuis le ${formatDate(date)}` : "Pret dans le stock ?"}
    >
      <input type="hidden" name="numero_proforma" value={numeroProforma} />
      <input
        type="checkbox"
        name="pret_stock"
        defaultChecked={checked}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-4 w-4 accent-emerald-600"
      />
      {checked && date ? (
        <span className="text-[10px] font-semibold text-emerald-700">{formatDate(date)}</span>
      ) : null}
    </form>
  );
}
