-- Ajoute un champ texte libre "Utilisation" sur les articles matiere
-- premiere (ex: "emballage gel douche", "bouchon flacon 500ml").
alter table public.articles_matiere_premiere
  add column if not exists utilisation text;
