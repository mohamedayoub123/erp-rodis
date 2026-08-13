-- Unifie le code de "LAIT ANTI MOSQUITO BABY 200ML" (id=667) sur celui de
-- "LAIT ANTI MOSQUITO BABY 90ML" (id=666), les 2 contenances du meme
-- produit qui avaient ete codees separement par erreur avant la mise en
-- place du partage de code par famille.

update public.articles
set code_auto = 'DA0516', code_manu = 'DA2435'
where id = 667;
