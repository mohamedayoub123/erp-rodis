"use client";

import { useState } from "react";
import { SortiePanel, type LotOption } from "../staged-movements";

export function SortieClient({
  lots,
  canWrite,
}: {
  lots: LotOption[];
  canWrite: boolean;
}) {
  const [lotsState, setLotsState] = useState<LotOption[]>(lots);

  if (!canWrite) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <p className="text-lg font-bold text-slate-900">Lecture seule</p>
        <p className="mt-2 text-sm text-slate-600">
          Le formulaire de sortie est cache pour cet utilisateur.
        </p>
      </div>
    );
  }

  return <SortiePanel lots={lotsState} onLotsUpdated={setLotsState} />;
}
