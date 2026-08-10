-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
-- Portage du module Qualite depuis le V1 (main).
-- Intervalle de tests labo par article (vrac) - pH/viscosite/densite/degre
-- alcool en min/max numerique, stabilite/couleur en texte de reference
-- (deja suivis comme du texte libre sur le rapport de Fabrication).
create table if not exists public.articles_specs_qualite (
  article_id bigint primary key references public.articles(id),
  ph_min numeric,
  ph_max numeric,
  viscosite_min numeric,
  viscosite_max numeric,
  densite_min numeric,
  densite_max numeric,
  degre_alcool_min numeric,
  degre_alcool_max numeric,
  stabilite text,
  couleur text,
  updated_at timestamptz not null default now()
);
