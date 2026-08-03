-- Articles Matiere Premiere - meme principe que la table "articles" (PF)
-- mais avec un jeu de champs reduit : nom, categorie, unite. "Gamme"
-- n'existe pas dans le classeur Excel source (feuille Parametres) - c'est
-- un champ ajoute manuellement ici, modifiable depuis la page.
create table if not exists public.articles_matiere_premiere (
  id bigint generated always as identity primary key,
  nom_article text not null,
  article_normalise text not null,
  categorie text,
  unite text,
  gamme text,
  created_at timestamptz not null default now()
);

alter table public.articles_matiere_premiere
  drop constraint if exists articles_matiere_premiere_normalise_key;

alter table public.articles_matiere_premiere
  add constraint articles_matiere_premiere_normalise_key unique (article_normalise);
