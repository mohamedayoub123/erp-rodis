"use client";

import { useState } from "react";
import { SortiePanelMp, type LotMpOption } from "../staged-movements-mp";

export function SortieMpClient({
  lots,
  canWrite,
}: {
  lots: LotMpOption[];
  canWrite: boolean;
}) {
  const [lotsState, setLotsState] = useState<LotMpOption[]>(lots);

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

  return <SortiePanelMp lots={lotsState} onLotsUpdated={setLotsState} />;
}
