"use client";

// Un seul jour choisi remplit "depuis" ET "jusqu'au" avec la meme date et
// soumet directement - evite de devoir remplir 2 fois la meme date pour
// voir juste le programme d'un jour precis (les 2 champs depuis/jusqu'au
// restent utilisables tels quels pour une vraie plage).
export function SingleDayFilter({ defaultValue }: { defaultValue: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
      Jour precis
      <input
        type="date"
        defaultValue={defaultValue}
        onChange={(event) => {
          const form = event.currentTarget.closest("form");
          if (!form) return;
          const value = event.currentTarget.value;
          const debut = form.querySelector<HTMLInputElement>('input[name="date_debut"]');
          const fin = form.querySelector<HTMLInputElement>('input[name="date_fin"]');
          if (debut) debut.value = value;
          if (fin) fin.value = value;
          form.requestSubmit();
        }}
        className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
      />
    </label>
  );
}
