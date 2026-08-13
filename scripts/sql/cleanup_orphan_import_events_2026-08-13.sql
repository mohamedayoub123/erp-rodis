-- Nettoie 40 evenements "en cours d'achat 4D" (bons_commande_mp_imports,
-- lot_stock_id NULL) qui sont en realite deja receptionnes : pour chacun,
-- il existe un AUTRE evenement (issu du bouton "Reception") sur la MEME
-- ligne BC, avec exactement la MEME quantite, qui lui a bien un
-- lot_stock_id (donc deja compte dans le stock reel). Le premier
-- evenement (la "declaration" d'import) n'a jamais ete marque comme
-- termine quand la Reception a ete faite separement - il reste donc
-- affiche a tort comme "encore en attente" sur Import MP, Commande MP et
-- Statistique MP (ex: "1850 date prevue non saisie" signale par
-- l'utilisateur sur WHITE SECRET, bc_ligne_id=831, evenement id=710).
--
-- Verifie ligne par ligne : chacun des 40 evenements ci-dessous a un
-- jumeau receptionne (lot_stock_id non NULL) sur la meme ligne BC avec la
-- meme quantite_importee, confirmant qu'il s'agit bien d'un doublon de
-- suivi et non d'une vraie quantite manquante. Total supprime : 7 813 050
-- unites (reparties sur 40 lignes BC).
--
-- Supprime uniquement l'evenement "ouvert" (le doublon) - l'evenement
-- receptionne et le lot de stock physique restent intacts.

delete from public.bons_commande_mp_imports
where id in (
  539,540,541,542,543,544,545,546,547,548,549,551,552,553,554,
  570,573,574,575,576,577,578,580,582,583,584,585,586,587,588,589,
  590,591,592,594,595,597,694,710,712
)
and lot_stock_id is null;
