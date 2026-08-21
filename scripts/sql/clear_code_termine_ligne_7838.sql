-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Cas particulier PL181.2026 (groupe_id/programme_lignes.id = 7838) : les
-- 4 autres tables (rapport, vrac, carton, emballage) ont deja ete
-- supprimees une par une depuis Suivi Production - la ligne a donc
-- disparu de cette page, rendant le nouveau bouton "Supprimer" (qui
-- nettoie normalement production_code_termine/production_mp_reserve)
-- inaccessible pour ce cas precis. Ce script fait manuellement le meme
-- nettoyage, pour finir de debloquer la suppression du Programme par
-- ligne parent.
delete from public.production_mp_reserve
where production_code_termine_id in (
  select id from public.production_code_termine where programme_ligne_id = 7838
);

delete from public.production_code_termine
where programme_ligne_id = 7838;
