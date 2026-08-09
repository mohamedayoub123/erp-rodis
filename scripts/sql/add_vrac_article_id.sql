-- Pour un article PF fini (nature='fini'), quel vrac (article PF nature='vrac')
-- est utilise pour le conditionner. Sert a la recette Conditionnement et a
-- la future page Programme (choisir l'article fini -> retrouve directement
-- son vrac).
alter table articles
  add column if not exists vrac_article_id bigint references articles(id);
