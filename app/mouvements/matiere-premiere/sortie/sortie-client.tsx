"use client";

import { SortiePanelMp, type ArticleMpOption, type LotBalanceMpOption } from "../staged-movements-mp";

export function SortieMpClient({
  articles,
  lots,
  canWrite,
}: {
  articles: ArticleMpOption[];
  lots: LotBalanceMpOption[];
  canWrite: boolean;
}) {
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

  return <SortiePanelMp articles={articles} mode="normal" lots={lots} />;
}
