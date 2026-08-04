-- Un code de lot ("code" sur programme_dispatcher_lignes, ex: AA1111) doit
-- toujours identifier un seul lot physique. Sans contrainte, deux "Save"
-- lances a quelques millisecondes d'ecart sur la meme famille d'articles
-- pouvaient tous les deux calculer le meme prochain code et l'inserer
-- silencieusement en double - meme code sur deux lots physiques differents,
-- une vraie erreur de tracabilite en production.
--
-- Index unique partiel (code is not null) plutot qu'une contrainte simple :
-- certaines lignes dispatcher peuvent avoir code = null (aucun code
-- exploitable trouve dans la famille, voir generateAutoCodes), et Postgres
-- traite deja NULL comme distinct de tout autre NULL dans un index unique
-- standard - la clause "where code is not null" est seulement la pour
-- documenter explicitement l'intention.
create unique index if not exists programme_dispatcher_lignes_code_unique_idx
  on public.programme_dispatcher_lignes (code)
  where code is not null;
