import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ[key.strip()] = value.strip().strip('"').strip("'")


def request_json(url: str, api_key: str, method: str = "GET", payload=None, extra_headers=None):
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read().decode("utf-8", errors="ignore")
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"{error.code} {url}: {detail}") from error


def fetch_all(base_url: str, api_key: str, table: str, select: str) -> list[dict]:
    rows: list[dict] = []
    from_idx = 0
    page_size = 1000
    while True:
        query = urllib.parse.urlencode({"select": select})
        request = urllib.request.Request(
            f"{base_url}/rest/v1/{table}?{query}",
            headers={
                "apikey": api_key,
                "Authorization": f"Bearer {api_key}",
                "Range": f"{from_idx}-{from_idx + page_size - 1}",
            },
        )
        with urllib.request.urlopen(request) as response:
            chunk = json.loads(response.read().decode("utf-8"))
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        from_idx += page_size
    return rows


def fuzzy_key(value) -> str:
    text = (str(value) if value is not None else "").replace("\xa0", " ").upper()
    text = text.replace("-", " ")
    text = text.replace("PRERFECT", "PERFECT")
    text = re.sub(r"(\d)\s+(ML|GRS|G|L|KG)\b", r"\1\2", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def excel_fraction_to_minutes(value):
    if value is None:
        return None
    return round(float(value) * 24 * 60)


def main() -> int:
    project_root = Path(__file__).resolve().parents[1]
    load_env(project_root / ".env.local")

    base_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    api_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not api_key:
        print("Missing Supabase env values.")
        return 1

    print("Lecture des articles...")
    articles = fetch_all(base_url, api_key, "articles", "id,nom_article,type_article")
    article_by_fuzzy_name = {}
    for article in articles:
        key = fuzzy_key(article.get("nom_article"))
        if key:
            article_by_fuzzy_name[key] = article
    print(f"{len(articles)} articles charges.")

    print("Lecture du groupe_id max actuel...")
    existing_groups = fetch_all(base_url, api_key, "programme_lignes", "groupe_id")
    next_groupe_id = max([g.get("groupe_id") or 0 for g in existing_groups], default=0) + 1

    print("Lecture de suivi_tirage...")
    suivi_rows = fetch_all(
        base_url,
        api_key,
        "suivi_tirage",
        "id,date_jour,zone,chaine,produit,code_labo,programme_de_production,qt_carton,"
        "chef_zone,chef_ligne,tireur,cadence,poids_reel,qt_fabriquer,"
        "arret_depot,arret_consommable_non_livre,arret_manque_conditionnement,arret_manque_vrac,"
        "arret_technique,arret_coupure_courant,arret_raclage_vrac,arret_changement_lot,"
        "arret_flacons_nc,arret_autre,temps_demarage_lot,temps_arret_batch",
    )
    print(f"{len(suivi_rows)} lignes suivi_tirage chargees.")

    skipped_no_date = 0
    ligne_payloads = []
    rapport_source = []  # gardee alignee avec ligne_payloads, meme index

    for row in suivi_rows:
        if not row.get("date_jour"):
            skipped_no_date += 1
            continue

        article = article_by_fuzzy_name.get(fuzzy_key(row.get("produit")))

        ligne_payloads.append(
            {
                "groupe_id": next_groupe_id,
                # zone/chaine sont NOT NULL en base - une chaine vide reste
                # affichee comme "-" cote appli, sans bloquer l'insertion.
                "zone": row.get("zone") or "",
                "chaine": row.get("chaine") or "",
                "produit": row.get("produit"),
                "article_id": article["id"] if article else None,
                "type_article": article.get("type_article") if article else None,
                "qt_carton": row.get("qt_carton"),
                "vrac_a_fabriquer": None,
                "plateforme": None,
                "programe": row.get("programme_de_production"),
                "date_jour": row["date_jour"],
                "numero_lot": row.get("code_labo"),
                "vrac_termine": True,
                "vrac_termine_date": row["date_jour"],
                "carton_termine": True,
                "carton_termine_date": row["date_jour"],
                "emballage_termine": True,
                "emballage_termine_date": row["date_jour"],
                "programme_termine": True,
                "programme_termine_date": row["date_jour"],
            }
        )
        rapport_source.append(row)
        next_groupe_id += 1

    print(f"{len(ligne_payloads)} lignes a creer, {skipped_no_date} ignorees (pas de date).")

    created_lignes = 0
    created_rapports = 0
    mismatches = 0
    chunk_size = 100

    for start in range(0, len(ligne_payloads), chunk_size):
        chunk_lignes = ligne_payloads[start : start + chunk_size]
        chunk_source = rapport_source[start : start + chunk_size]

        inserted = request_json(
            f"{base_url}/rest/v1/programme_lignes",
            api_key,
            method="POST",
            payload=chunk_lignes,
            extra_headers={"Prefer": "return=representation"},
        )

        if len(inserted) != len(chunk_lignes):
            raise RuntimeError(
                f"Reponse inattendue: {len(inserted)} lignes creees pour {len(chunk_lignes)} envoyees."
            )

        rapport_payloads = []
        for inserted_row, source_row, sent_ligne in zip(inserted, chunk_source, chunk_lignes):
            # Verification de securite : l'ordre retourne doit correspondre a
            # l'ordre envoye, sinon on n'associe surtout pas le rapport a la
            # mauvaise ligne (des doublons numero_lot+date existent, donc on
            # compare aussi zone/chaine/produit/groupe_id pour etre sur).
            check_fields = ("groupe_id", "numero_lot", "date_jour", "zone", "chaine", "produit")
            if any(inserted_row.get(field) != sent_ligne.get(field) for field in check_fields):
                mismatches += 1
                continue

            rapport_payloads.append(
                {
                    "programme_ligne_id": inserted_row["id"],
                    "chef_zone": source_row.get("chef_zone"),
                    "chef_ligne": source_row.get("chef_ligne"),
                    "tireur": source_row.get("tireur"),
                    "qt_fabriquer": source_row.get("qt_fabriquer"),
                    "cadence": source_row.get("cadence"),
                    "poids_reel": source_row.get("poids_reel"),
                    "arret_depot": excel_fraction_to_minutes(source_row.get("arret_depot")),
                    "arret_consommable_non_livre": excel_fraction_to_minutes(
                        source_row.get("arret_consommable_non_livre")
                    ),
                    "arret_manque_conditionnement": excel_fraction_to_minutes(
                        source_row.get("arret_manque_conditionnement")
                    ),
                    "arret_manque_vrac": excel_fraction_to_minutes(source_row.get("arret_manque_vrac")),
                    "arret_technique": excel_fraction_to_minutes(source_row.get("arret_technique")),
                    "arret_coupure_courant": excel_fraction_to_minutes(
                        source_row.get("arret_coupure_courant")
                    ),
                    "arret_raclage_vrac": excel_fraction_to_minutes(source_row.get("arret_raclage_vrac")),
                    "arret_changement_lot": excel_fraction_to_minutes(
                        source_row.get("arret_changement_lot")
                    ),
                    "arret_flacons_nc": excel_fraction_to_minutes(source_row.get("arret_flacons_nc")),
                    "arret_autre": excel_fraction_to_minutes(source_row.get("arret_autre")),
                    "temps_demarage_lot": source_row.get("temps_demarage_lot"),
                    "temps_arret_batch": source_row.get("temps_arret_batch"),
                }
            )

        if rapport_payloads:
            request_json(
                f"{base_url}/rest/v1/production_rapports",
                api_key,
                method="POST",
                payload=rapport_payloads,
                extra_headers={"Prefer": "return=minimal"},
            )
            created_rapports += len(rapport_payloads)

        created_lignes += len(inserted)
        print(f"  ... {created_lignes}/{len(ligne_payloads)} lignes creees")

    print("Termine.")
    print(f"  Lignes Programme par ligne creees : {created_lignes}")
    print(f"  Rapports crees : {created_rapports}")
    if mismatches:
        print(f"  ATTENTION : {mismatches} rapports non crees (ordre de reponse inattendu).")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
