-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Le "type" antiseptique existe en base sous 3 orthographes DIFFERENTES
-- (jamais la meme chaine exacte, donc jamais reconnues comme le meme type
-- par la comparaison exacte de programme-table.tsx) :
--   - articles.type_article = 'anti septique'   (nouveaux articles SPRAY MOSTDEFENCE)
--   - articles.type_article = 'Anti sptique '   (18 anciens articles, espace en trop + faute)
--   - machines.type_produit contient 'Anti sptique' (2 machines Embalage, meme faute)
-- Uniformise tout vers UNE seule orthographe correcte : "Anti septique".
update public.articles
set type_article = 'Anti septique'
where type_article in ('anti septique', 'Anti sptique ', 'Anti sptique');

update public.machines
set type_produit = array_replace(type_produit, 'Anti sptique', 'Anti septique')
where 'Anti sptique' = any(type_produit);
