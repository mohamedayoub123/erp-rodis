-- FUSION de deux articles qui sont le meme produit : "DSR BBC 30grs" (n 162) est supprime, "DSR BBC EXTRA 30ML" (n 6486)
-- est garde. TOUT ce qui etait au nom de l'article 162 passe au nom de l'article 6486 : stock et mouvements (entrees /
-- sorties), lignes de commande, resultats FIFO, lignes de programme et de dispatch. A coller dans Supabase Dashboard > SQL
-- Editor, puis ecrire "SQL OK" dans le chat de Claude (pas dans ce fichier).
--
-- Securite :
--   * tout se fait dans UNE transaction : si une seule etape echoue, RIEN n'est change ;
--   * le script verifie d'abord que les articles 162 et 6486 portent bien ces noms, sinon il s'arrete ;
--   * une SAUVEGARDE complete de ce qui est touche est gardee dans la table sauvegarde_fusion_articles (lignes en JSON),
--     pour pouvoir tout retrouver si besoin ;
--   * la recette de l'article 162 est supprimee : l'article 6486 garde la sienne (7 lignes chacun).
--
-- Resume des changements (comptes avant la fusion) : lots_stock 121, commande_lignes 45, fifo_resultats 41,
-- programme_lignes 5, programme_dispatcher_history 4, recettes_pf 7 (supprimees), pending_article_code_updates 1 (supprimee :
-- code CC0046V deja depasse par CC0049V de l'article 6486).

create table if not exists public.sauvegarde_fusion_articles (
  id bigserial primary key,
  date_fusion timestamptz not null default now(),
  description text,
  donnees jsonb not null
);
alter table public.sauvegarde_fusion_articles enable row level security;

begin;

do $$
declare
  nom_ancien text;
  nom_garde text;
begin
  select nom_article into nom_ancien from public.articles where id = 162;
  select nom_article into nom_garde from public.articles where id = 6486;
  if nom_ancien is distinct from 'DSR BBC 30grs' then
    raise exception 'Article 162 introuvable ou renomme (nom lu : %) - fusion annulee', nom_ancien;
  end if;
  if nom_garde is distinct from 'DSR BBC EXTRA 30ML' then
    raise exception 'Article 6486 introuvable ou renomme (nom lu : %) - fusion annulee', nom_garde;
  end if;
end
$$;

-- 1) Sauvegarde de tout ce qui va changer
insert into public.sauvegarde_fusion_articles (description, donnees)
select
  'Fusion de l''article 162 (DSR BBC 30grs) dans l''article 6486 (DSR BBC EXTRA 30ML)',
  jsonb_build_object(
    'article_162', (select to_jsonb(a) from public.articles a where a.id = 162),
    'lots_stock', coalesce((select jsonb_agg(to_jsonb(t)) from public.lots_stock t where t.article_id = 162), '[]'::jsonb),
    'commande_lignes', coalesce((select jsonb_agg(to_jsonb(t)) from public.commande_lignes t where t.article_id = 162), '[]'::jsonb),
    'fifo_resultats', coalesce((select jsonb_agg(to_jsonb(t)) from public.fifo_resultats t where t.article_id = 162), '[]'::jsonb),
    'programme_lignes', coalesce((select jsonb_agg(to_jsonb(t)) from public.programme_lignes t where t.article_id = 162), '[]'::jsonb),
    'programme_dispatcher_history', coalesce((select jsonb_agg(to_jsonb(t)) from public.programme_dispatcher_history t where t.article_id = 162), '[]'::jsonb),
    'recettes_pf', coalesce((select jsonb_agg(to_jsonb(t)) from public.recettes_pf t where t.article_pf_id = 162), '[]'::jsonb),
    'pending_article_code_updates', coalesce((select jsonb_agg(to_jsonb(t)) from public.pending_article_code_updates t where t.article_id = 162), '[]'::jsonb)
  );

-- 2) Tout passe au nom de l'article 6486 (stock, entrees / sorties, commandes, FIFO, programmes)
update public.lots_stock set article_id = 6486 where article_id = 162;
update public.commande_lignes set article_id = 6486 where article_id = 162;
update public.fifo_resultats set article_id = 6486 where article_id = 162;
update public.programme_lignes set article_id = 6486, produit = 'DSR BBC EXTRA 30ML' where article_id = 162;
update public.programme_dispatcher_history set article_id = 6486, produit = 'DSR BBC EXTRA 30ML' where article_id = 162;

-- 3) Ce qui n'a plus de sens pour l'article supprime
delete from public.pending_article_code_updates where article_id = 162;
delete from public.recettes_pf where article_pf_id = 162;

-- 4) L'article 162 disparait
delete from public.articles where id = 162;

commit;

-- 5) Verification (a lire apres l'execution) : l'article 162 n'a plus rien, l'article 6486 a tout
--    attendu : article_162_restant = 0, lots_stock_162_restants = 0, lots_stock_6486 = 125 (121 + 4),
--    commande_lignes_6486 = 45, programme_lignes_6486 = 8 (5 + 3)
select
  (select count(*) from public.articles where id = 162) as article_162_restant,
  (select count(*) from public.lots_stock where article_id = 162) as lots_stock_162_restants,
  (select count(*) from public.lots_stock where article_id = 6486) as lots_stock_6486,
  (select count(*) from public.commande_lignes where article_id = 6486) as commande_lignes_6486,
  (select count(*) from public.programme_lignes where article_id = 6486) as programme_lignes_6486;
