"use client";

import { useState } from "react";
import { EntreePanel, type ArticleOption, type LotOption } from "../staged-movements";

export function EntreeClient({
  articles,
  canWrite,
}: {
  articles: ArticleOption[];
  canWrite: boolean;
}) {
  const [, setLotsState] = useState<LotOption[]>([]);

  if (!canWrite) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <p className="text-lg font-bold text-slate-900">Lecture seule</p>
        <p className="mt-2 text-sm text-slate-600">
          Le formulaire d&apos;entree est cache pour cet utilisateur.
        </p>
      </div>
    );
  }

  return <EntreePanel articles={articles} onLotsCreated={setLotsState} />;
}
