"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteArticleAction, updateArticleAction } from "./actions";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { matchesArticleSearch } from "@/lib/article-search";

const EXPORT_COLUMNS = [
  { label: "Article", key: "nom_article" },
  { label: "Type", key: "type_article" },
  { label: "Marque", key: "marque" },
  { label: "Gamme", key: "gamme" },
  { label: "Nature", key: "nature_label" },
  { label: "Min", key: "min_stock" },
  { label: "Max", key: "max_stock" },
  { label: "Volume unitaire", key: "volume_unitaire" },
  { label: "Volume stockage", key: "volume_stockage" },
  { label: "Contenance", key: "contenance" },
  { label: "Cadence", key: "cadence" },
  { label: "Nb carton par vrac", key: "nb_carton_par_vrac" },
  { label: "Max prod vrac 8h", key: "max_production_vrac_8h" },
  { label: "Nb piece par max vrac", key: "nb_piece_par_max_vrac" },
  { label: "Piece par carton", key: "piece_par_carton" },
  { label: "Min vrac", key: "min_vrac" },
  { label: "Max vrac auto", key: "max_vrac_auto" },
  { label: "Vrac max manuel", key: "vrac_max_manuel" },
  { label: "Dispenseur pcs/carton", key: "dispenseur_pcs_carton" },
  { label: "Pot/flacon", key: "besoin_pot_flacon" },
  { label: "Capsule", key: "besoin_capsule" },
  { label: "Sleeve", key: "besoin_sleeve" },
  { label: "Dispenseur", key: "besoin_dispenseur" },
  { label: "Carton", key: "besoin_carton" },
  { label: "Etiquette", key: "besoin_etiquette" },
  { label: "Etui", key: "besoin_etui" },
];

export type ArticleRow = {
  id: number;
  nom_article: string;
  type_article: string | null;
  marque: string | null;
  gamme: string | null;
  nature: string | null;
  min_stock: number | null;
  max_stock: number | null;
  volume_unitaire: number | null;
  volume_stockage: number | null;
  cadence: number | null;
  nb_carton_par_vrac: number | null;
  max_production_vrac_8h: number | null;
  contenance: number | null;
  nb_piece_par_max_vrac: number | null;
  piece_par_carton: number | null;
  min_vrac: number | null;
  max_vrac_auto: number | null;
  vrac_max_manuel: number | null;
  dispenseur_pcs_carton: number | null;
  besoin_pot_flacon: boolean | null;
  besoin_capsule: boolean | null;
  besoin_sleeve: boolean | null;
  besoin_dispenseur: boolean | null;
  besoin_carton: boolean | null;
  besoin_etiquette: boolean | null;
  besoin_etui: boolean | null;
  code_auto: string | null;
  code_manu: string | null;
  depot_id: number | null;
};

const VISIBLE_STEP = 100;

function formatRounded(value: number | null) {
  if (value === null || value === undefined) return "-";
  return Math.round(value).toString();
}

// Meme motif que SearchableFilterInput (app/_components/searchable-filter-input.tsx),
// mais en filtrage EN DIRECT (state React, pas de formulaire GET/navigation) :
// fleches haut/bas deplacent la selection dans la liste, Entree choisit
// l'option en surbrillance (par defaut la premiere), Echap ferme le menu.
function FilterField({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: string[];
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const suggestions = useMemo(() => {
    const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return options.slice(0, 100);
    return options.filter((option) => {
      const label = option.toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [options, value]);

  function selectOption(option: string) {
    onChange(option);
    setShowDropdown(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      // Choisit l'option en surbrillance plutot que de laisser Entree ne
      // rien faire (comportement avant : preventDefault seul, sans effet).
      event.preventDefault();
      selectOption(suggestions[highlightIndex] ?? suggestions[0]);
    } else if (event.key === "Escape") {
      setShowDropdown(false);
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setShowDropdown(true);
          setHighlightIndex(0);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-0 placeholder:text-slate-400"
      />
      {showDropdown && suggestions.length > 0 ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          {suggestions.map((option, index) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightIndex(index)}
              onClick={() => selectOption(option)}
              className={`block w-full px-4 py-2 text-left text-sm ${
                index === highlightIndex ? "bg-sky-50 text-sky-900" : "text-slate-800 hover:bg-slate-100"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Filtre en direct (state React, pas de navigation/soumission) - tape un
// mot et la liste se met a jour tout de suite, meme sans choisir une
// proposition de la liste deroulante.
export function ArticlesProduitFiniTable({
  articles,
  depots,
  canEditArticles,
  canDeleteArticles,
}: {
  articles: ArticleRow[];
  depots: { id: number; label: string }[];
  canEditArticles: boolean;
  canDeleteArticles: boolean;
}) {
  const depotNomById = new Map(depots.map((d) => [d.id, d.label]));
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [gamme, setGamme] = useState("");

  const articleOptions = useMemo(
    () => [...new Set(articles.map((article) => article.nom_article).filter(Boolean))],
    [articles]
  );
  const typeOptions = useMemo(
    () => [...new Set(articles.map((article) => article.type_article).filter(Boolean))] as string[],
    [articles]
  );
  const gammeOptions = useMemo(
    () => [...new Set(articles.map((article) => article.gamme).filter(Boolean))] as string[],
    [articles]
  );

  const hasFilters = Boolean(q.trim() || type.trim() || gamme.trim());

  const filteredArticles = useMemo(() => {
    const qTrim = q.trim();
    const typeLower = type.trim().toLowerCase();
    const gammeLower = gamme.trim().toLowerCase();

    return articles.filter((article) => {
      if (qTrim && !matchesArticleSearch(article.nom_article, qTrim)) return false;
      if (typeLower && !String(article.type_article ?? "").toLowerCase().includes(typeLower)) return false;
      if (gammeLower && !String(article.gamme ?? "").toLowerCase().includes(gammeLower)) return false;
      return true;
    });
  }, [articles, q, type, gamme]);

  // Export = exactement ce que le filtre affiche (filteredArticles), jamais
  // la liste complete - demande explicite de l'utilisateur ("si ya filtre
  // il prend seulement ca qui trouve le filtre").
  const exportRows = useMemo(
    () =>
      filteredArticles.map((article) => ({
        ...article,
        nature_label: article.nature === "vrac" ? "Vrac" : "Fini",
        besoin_pot_flacon: article.besoin_pot_flacon ? "Oui" : "",
        besoin_capsule: article.besoin_capsule ? "Oui" : "",
        besoin_sleeve: article.besoin_sleeve ? "Oui" : "",
        besoin_dispenseur: article.besoin_dispenseur ? "Oui" : "",
        besoin_carton: article.besoin_carton ? "Oui" : "",
        besoin_etiquette: article.besoin_etiquette ? "Oui" : "",
        besoin_etui: article.besoin_etui ? "Oui" : "",
      })),
    [filteredArticles]
  );

  // Rendre les 849 lignes d'un coup (chacune avec son formulaire de
  // modification complet, ~25 champs) rendait la page lente a l'ouverture -
  // on affiche seulement les VISIBLE_STEP premieres et on agrandit la
  // fenetre au clic, la recherche elle reste instantanee (filtre en memoire
  // sur tout le tableau, independant de ce qui est affiche).
  const [visibleCount, setVisibleCount] = useState(VISIBLE_STEP);

  useEffect(() => {
    setVisibleCount(VISIBLE_STEP);
  }, [q, type, gamme]);

  const visibleArticles = filteredArticles.slice(0, visibleCount);
  const hiddenCount = filteredArticles.length - visibleArticles.length;

  return (
    <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="grid gap-3 border-b border-slate-100 px-6 py-5 lg:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
        <FilterField value={q} onChange={setQ} placeholder="Ecrire article..." options={articleOptions} />
        <FilterField value={type} onChange={setType} placeholder="Ecrire type..." options={typeOptions} />
        <FilterField value={gamme} onChange={setGamme} placeholder="Ecrire gamme..." options={gammeOptions} />
        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setType("");
              setGamme("");
            }}
            className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
          >
            Effacer
          </button>
        ) : null}
        <div className="flex items-center justify-center">
          <ExportExcelButton
            rows={exportRows}
            columns={EXPORT_COLUMNS}
            filename={`articles-produit-fini-${new Date().toISOString().slice(0, 10)}.xlsx`}
          />
        </div>
      </div>

      <p className="px-6 pt-4 text-xs font-semibold text-slate-500">
        {filteredArticles.length} article{filteredArticles.length > 1 ? "s" : ""}
        {hasFilters ? ` sur ${articles.length}` : ""}
      </p>

      {filteredArticles.length === 0 ? (
        <div className="px-6 py-8 text-sm text-slate-500">
          {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun article trouve pour le moment."}
        </div>
      ) : (
        <div className="max-h-[75vh] overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-slate-950">
              <tr>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Article</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Type</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Marque</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Gamme</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Nature</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Min</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Max</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Volume unitaire</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Volume stockage</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Contenance</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Cadence</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Nb carton par vrac</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Max prod vrac 8h</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Nb piece par max vrac</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Piece par carton</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Min vrac</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Max vrac auto</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Vrac max manuel</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Dispenseur pcs/carton</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Pot/flacon</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Capsule</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Sleeve</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Dispenseur</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Carton</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Etiquette</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Etui</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Depot</th>
                {canEditArticles ? <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Modifier</th> : null}
                {canDeleteArticles ? <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Supprimer</th> : null}
              </tr>
            </thead>
            <tbody>
              {visibleArticles.map((article) => (
                <tr key={article.id} className="border-t border-slate-100 align-top">
                  <td className="px-6 py-4 font-medium text-slate-900">{article.nom_article}</td>
                  <td className="px-6 py-4 text-slate-600">{article.type_article || "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.marque || "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.gamme || "-"}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        article.nature === "vrac"
                          ? "bg-sky-100 text-sky-900"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {article.nature === "vrac" ? "Vrac" : "Fini"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{article.min_stock ?? 0}</td>
                  <td className="px-6 py-4 text-slate-600">{article.max_stock ?? 0}</td>
                  <td className="px-6 py-4 text-slate-600">{article.volume_unitaire ?? "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.volume_stockage ?? "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.contenance ?? "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.cadence ?? "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{formatRounded(article.nb_carton_par_vrac)}</td>
                  <td className="px-6 py-4 text-slate-600">{article.max_production_vrac_8h ?? "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{formatRounded(article.nb_piece_par_max_vrac)}</td>
                  <td className="px-6 py-4 text-slate-600">{article.piece_par_carton ?? "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.min_vrac ?? "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.max_vrac_auto ?? "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.vrac_max_manuel ?? "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.dispenseur_pcs_carton ?? "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.besoin_pot_flacon ? "Oui" : "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.besoin_capsule ? "Oui" : "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.besoin_sleeve ? "Oui" : "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.besoin_dispenseur ? "Oui" : "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.besoin_carton ? "Oui" : "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.besoin_etiquette ? "Oui" : "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{article.besoin_etui ? "Oui" : "-"}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {article.depot_id ? depotNomById.get(article.depot_id) ?? `Depot #${article.depot_id}` : "-"}
                  </td>
                  {canEditArticles ? (
                    <td className="px-6 py-4">
                      <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                          Modifier
                        </summary>

                        <form action={updateArticleAction} className="mt-4 grid gap-3">
                          <input type="hidden" name="article_id" value={article.id} />
                          <input
                            type="text"
                            name="nom_article"
                            defaultValue={article.nom_article}
                            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                            required
                          />
                          <input
                            type="text"
                            name="type_article"
                            defaultValue={article.type_article || ""}
                            placeholder="Type"
                            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                          />
                          <input
                            type="text"
                            name="marque"
                            defaultValue={article.marque || ""}
                            placeholder="Marque"
                            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                          />
                          <input
                            type="text"
                            name="gamme"
                            defaultValue={article.gamme || ""}
                            placeholder="Gamme"
                            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                          />
                          <label className="grid gap-1 text-xs font-semibold text-slate-500">
                            Nature
                            <select
                              name="nature"
                              defaultValue={article.nature === "vrac" ? "vrac" : "fini"}
                              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                            >
                              <option value="fini">Produit fini (conditionnement)</option>
                              <option value="vrac">Vrac (fabrication)</option>
                            </select>
                          </label>
                          <div className="grid gap-3 md:grid-cols-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              name="min_stock"
                              defaultValue={article.min_stock ?? 0}
                              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                            />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              name="max_stock"
                              defaultValue={article.max_stock ?? 0}
                              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                            />
                          </div>
                          <label className="grid gap-1 text-xs font-semibold text-slate-500">
                            Depot
                            <select
                              name="depot_id"
                              defaultValue={article.depot_id ? String(article.depot_id) : ""}
                              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                            >
                              <option value="">Sans depot</option>
                              {depots.map((depot) => (
                                <option key={depot.id} value={depot.id}>
                                  {depot.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Production
                          </p>
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="grid gap-1 text-xs font-semibold text-slate-500">
                              Volume unitaire
                              <input
                                type="number"
                                step="0.001"
                                name="volume_unitaire"
                                defaultValue={article.volume_unitaire ?? ""}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-500">
                              Volume stockage
                              <input
                                type="number"
                                step="0.001"
                                name="volume_stockage"
                                defaultValue={article.volume_stockage ?? ""}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-500">
                              Contenance
                              <input
                                type="number"
                                step="0.001"
                                name="contenance"
                                defaultValue={article.contenance ?? ""}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-500">
                              Cadence
                              <input
                                type="number"
                                step="0.01"
                                name="cadence"
                                defaultValue={article.cadence ?? ""}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-500">
                              Nb carton par vrac
                              <input
                                type="number"
                                step="0.01"
                                name="nb_carton_par_vrac"
                                defaultValue={article.nb_carton_par_vrac ?? ""}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-500">
                              Max production vrac 8h
                              <input
                                type="number"
                                step="0.01"
                                name="max_production_vrac_8h"
                                defaultValue={article.max_production_vrac_8h ?? ""}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-500">
                              Nb piece par max vrac
                              <input
                                type="number"
                                step="0.01"
                                name="nb_piece_par_max_vrac"
                                defaultValue={article.nb_piece_par_max_vrac ?? ""}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-500">
                              Piece par carton
                              <input
                                type="number"
                                step="0.01"
                                name="piece_par_carton"
                                defaultValue={article.piece_par_carton ?? ""}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-500">
                              Min vrac
                              <input
                                type="number"
                                step="0.01"
                                name="min_vrac"
                                defaultValue={article.min_vrac ?? ""}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-500">
                              Max vrac auto
                              <input
                                type="number"
                                step="0.01"
                                name="max_vrac_auto"
                                defaultValue={article.max_vrac_auto ?? ""}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-500">
                              Vrac max manuel
                              <input
                                type="number"
                                step="0.01"
                                name="vrac_max_manuel"
                                defaultValue={article.vrac_max_manuel ?? ""}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-500">
                              Dispenseur pcs/carton
                              <input
                                type="number"
                                step="0.01"
                                name="dispenseur_pcs_carton"
                                defaultValue={article.dispenseur_pcs_carton ?? ""}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                              />
                            </label>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                            {(
                              [
                                ["besoin_pot_flacon", "Pot / flacon"],
                                ["besoin_capsule", "Capsule"],
                                ["besoin_sleeve", "Sleeve"],
                                ["besoin_dispenseur", "Dispenseur"],
                                ["besoin_carton", "Carton"],
                                ["besoin_etiquette", "Etiquette"],
                                ["besoin_etui", "Etui"],
                              ] as const
                            ).map(([name, label]) => (
                              <label
                                key={name}
                                className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs"
                              >
                                <input type="checkbox" name={name} defaultChecked={Boolean(article[name])} />
                                {label}
                              </label>
                            ))}
                          </div>

                          <div>
                            <SubmitButton
                              pendingLabel="Enregistrement..."
                              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                            >
                              Enregistrer
                            </SubmitButton>
                          </div>
                        </form>
                      </details>
                    </td>
                  ) : null}
                  {canDeleteArticles ? (
                    <td className="px-6 py-4">
                      <form action={deleteArticleAction}>
                        <input type="hidden" name="article_id" value={article.id} />
                        <DeleteIconButton label="Supprimer article" />
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hiddenCount > 0 ? (
        <div className="flex justify-center border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + VISIBLE_STEP)}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Voir plus ({hiddenCount} restant{hiddenCount > 1 ? "s" : ""})
          </button>
        </div>
      ) : null}
    </section>
  );
}
