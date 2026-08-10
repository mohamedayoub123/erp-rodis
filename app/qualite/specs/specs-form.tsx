"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteArticleSpecQualiteAction, upsertArticleSpecQualiteAction } from "../actions";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { matchesArticleSearch } from "@/lib/article-search";

type ArticleOption = { id: number; label: string };

export type SpecRow = {
  article_id: number;
  article_label: string;
  ph_min: number | null;
  ph_max: number | null;
  viscosite_min: number | null;
  viscosite_max: number | null;
  densite_min: number | null;
  densite_max: number | null;
  degre_alcool_min: number | null;
  degre_alcool_max: number | null;
  stabilite: string | null;
  couleur: string | null;
};

const EMPTY_FIELDS = {
  ph_min: "",
  ph_max: "",
  viscosite_min: "",
  viscosite_max: "",
  densite_min: "",
  densite_max: "",
  degre_alcool_min: "",
  degre_alcool_max: "",
  stabilite: "",
  couleur: "",
};

type Fields = typeof EMPTY_FIELDS;

function numToField(value: number | null) {
  return value === null || value === undefined ? "" : String(value);
}

function fieldsFromSpec(spec: SpecRow | undefined): Fields {
  if (!spec) return { ...EMPTY_FIELDS };
  return {
    ph_min: numToField(spec.ph_min),
    ph_max: numToField(spec.ph_max),
    viscosite_min: numToField(spec.viscosite_min),
    viscosite_max: numToField(spec.viscosite_max),
    densite_min: numToField(spec.densite_min),
    densite_max: numToField(spec.densite_max),
    degre_alcool_min: numToField(spec.degre_alcool_min),
    degre_alcool_max: numToField(spec.degre_alcool_max),
    stabilite: spec.stabilite ?? "",
    couleur: spec.couleur ?? "",
  };
}

const numberFieldClass = "rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none";

function NumberRange({
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          value={minValue}
          onChange={(event) => onMinChange(event.target.value)}
          placeholder="Min"
          className={`w-full ${numberFieldClass}`}
        />
        <span className="text-slate-400">-</span>
        <input
          type="number"
          step="0.01"
          value={maxValue}
          onChange={(event) => onMaxChange(event.target.value)}
          placeholder="Max"
          className={`w-full ${numberFieldClass}`}
        />
      </div>
    </div>
  );
}

export function SpecsQualiteForm({
  vracArticles,
  specs,
  canWrite,
  canDelete,
}: {
  vracArticles: ArticleOption[];
  specs: SpecRow[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const specByArticleId = useMemo(() => {
    const map = new Map<number, SpecRow>();
    for (const spec of specs) map.set(spec.article_id, spec);
    return map;
  }, [specs]);

  const [articleInput, setArticleInput] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<ArticleOption | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [fields, setFields] = useState<Fields>({ ...EMPTY_FIELDS });
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(
    () => vracArticles.filter((option) => matchesArticleSearch(option.label, articleInput)),
    [articleInput, vracArticles]
  );

  function selectArticle(article: ArticleOption) {
    setArticleInput(article.label);
    setSelectedArticle(article);
    setShowOptions(false);
    setFields(fieldsFromSpec(specByArticleId.get(article.id)));
    setError("");
  }

  function updateField(name: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit() {
    if (!selectedArticle) {
      setError("Choisis d'abord un article vrac.");
      return;
    }
    setError("");

    const formData = new FormData();
    formData.set("article_id", String(selectedArticle.id));
    for (const [name, value] of Object.entries(fields)) {
      formData.set(name, value);
    }

    startTransition(async () => {
      await upsertArticleSpecQualiteAction(formData);
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-lg font-bold text-slate-900">Ajouter / modifier une spec</h2>
        <p className="mt-1 text-sm text-slate-600">
          Choisis un article vrac - si une spec existe deja, les valeurs se remplissent pour la
          modifier.
        </p>

        <div className="mt-4 grid gap-4">
          <div className="relative">
            <input
              type="text"
              autoComplete="off"
              value={articleInput}
              onChange={(event) => {
                setArticleInput(event.target.value);
                setSelectedArticle(null);
                setShowOptions(true);
              }}
              onFocus={() => setShowOptions(true)}
              onBlur={() => setTimeout(() => setShowOptions(false), 150)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              placeholder="Ecrire un article vrac..."
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            {showOptions && filtered.length > 0 ? (
              <ul className="absolute left-0 top-full z-20 mt-1 max-h-64 w-full min-w-[24rem] max-w-[90vw] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-[0_18px_40px_rgba(15,23,42,0.15)]">
                {filtered.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectArticle(option)}
                      className="block w-full whitespace-normal px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                    >
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {selectedArticle ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberRange
                label="pH"
                minValue={fields.ph_min}
                maxValue={fields.ph_max}
                onMinChange={(v) => updateField("ph_min", v)}
                onMaxChange={(v) => updateField("ph_max", v)}
              />
              <NumberRange
                label="Viscosite"
                minValue={fields.viscosite_min}
                maxValue={fields.viscosite_max}
                onMinChange={(v) => updateField("viscosite_min", v)}
                onMaxChange={(v) => updateField("viscosite_max", v)}
              />
              <NumberRange
                label="Densite"
                minValue={fields.densite_min}
                maxValue={fields.densite_max}
                onMinChange={(v) => updateField("densite_min", v)}
                onMaxChange={(v) => updateField("densite_max", v)}
              />
              <NumberRange
                label="Degre alcool"
                minValue={fields.degre_alcool_min}
                maxValue={fields.degre_alcool_max}
                onMinChange={(v) => updateField("degre_alcool_min", v)}
                onMaxChange={(v) => updateField("degre_alcool_max", v)}
              />
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Centrifuge
                <select
                  value={fields.stabilite}
                  onChange={(event) => updateField("stabilite", event.target.value)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                >
                  <option value="">-</option>
                  <option value="Stable">Stable</option>
                  <option value="Non stable">Non stable</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Couleur
                <input
                  type="text"
                  value={fields.couleur}
                  onChange={(event) => updateField("couleur", event.target.value)}
                  placeholder="Ex: Blanc a blanc casse"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
            </div>
          ) : null}

          {error ? <p className="text-xs font-semibold text-red-700">{error}</p> : null}

          {canWrite ? (
            <div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {isPending ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        {specs.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-500">Aucune spec enregistree pour le moment.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Article</th>
                  <th className="px-4 py-3 font-semibold">pH</th>
                  <th className="px-4 py-3 font-semibold">Viscosite</th>
                  <th className="px-4 py-3 font-semibold">Densite</th>
                  <th className="px-4 py-3 font-semibold">Degre alcool</th>
                  <th className="px-4 py-3 font-semibold">Centrifuge</th>
                  <th className="px-4 py-3 font-semibold">Couleur</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold">Modifier</th> : null}
                  {canDelete ? <th className="px-4 py-3 font-semibold">Supprimer</th> : null}
                </tr>
              </thead>
              <tbody>
                {specs.map((spec) => (
                  <tr key={spec.article_id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{spec.article_label}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {spec.ph_min ?? "-"} - {spec.ph_max ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {spec.viscosite_min ?? "-"} - {spec.viscosite_max ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {spec.densite_min ?? "-"} - {spec.densite_max ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {spec.degre_alcool_min ?? "-"} - {spec.degre_alcool_max ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{spec.stabilite || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{spec.couleur || "-"}</td>
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            selectArticle({ id: spec.article_id, label: spec.article_label })
                          }
                          className="text-xs font-semibold text-sky-700 underline"
                        >
                          Modifier
                        </button>
                      </td>
                    ) : null}
                    {canDelete ? (
                      <td className="px-4 py-3">
                        <form action={deleteArticleSpecQualiteAction}>
                          <input type="hidden" name="article_id" value={spec.article_id} />
                          <DeleteIconButton label="Supprimer cette spec" />
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
