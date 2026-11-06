-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Module "Volume par lot MP" (Stock > Matiere premiere > Volume par lot) : on choisit un article et un de ses lots, on tape la
-- longueur, la largeur et la hauteur du LOT ENTIER (en cm) ; le volume (L x l x h, en m3) est calcule a l'affichage et repris dans la
-- colonne "Volume" de la page Stock Matiere Premiere sur chaque ligne de ce lot. Le volume n'est JAMAIS enregistre : seules les 3
-- dimensions le sont, une ligne par article + lot.
--
-- code_lot = numero de lot en MAJUSCULES et sans espaces autour (ab12, AB12 et " AB12 " sont le meme lot) ; numero_lot garde
-- l'ecriture d'origine pour l'affichage. Idempotent (peut etre relance sans risque). Aucune donnee existante n'est modifiee.
create table if not exists public.lots_mp_dimensions (
  article_id bigint not null references public.articles_matiere_premiere(id) on delete cascade,
  code_lot text not null,
  numero_lot text not null,
  longueur numeric not null check (longueur > 0),
  largeur numeric not null check (largeur > 0),
  hauteur numeric not null check (hauteur > 0),
  utilisateur text,
  updated_at timestamptz not null default now(),
  primary key (article_id, code_lot)
);

alter table public.lots_mp_dimensions enable row level security;
