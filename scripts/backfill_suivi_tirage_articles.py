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


def fetch_all(base_url: str, api_key: str, table: str, select: str, extra_query: str = "") -> list[dict]:
    rows: list[dict] = []
    from_idx = 0
    page_size = 1000
    while True:
        query = urllib.parse.urlencode({"select": select})
        url = f"{base_url}/rest/v1/{table}?{query}"
        if extra_query:
            url += f"&{extra_query}"
        request = urllib.request.Request(
            url,
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


def main() -> int:
    project_root = Path(__file__).resolve().parents[1]
    load_env(project_root / ".env.local")

    base_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    api_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not api_key:
        print("Missing Supabase env values.")
        return 1

    print("Lecture des articles...")
    articles = fetch_all(base_url, api_key, "articles", "id,nom_article,gamme,type_article,piece_par_carton")
    article_by_fuzzy_name: dict[str, dict] = {}
    for article in articles:
        key = fuzzy_key(article.get("nom_article"))
        if key:
            article_by_fuzzy_name[key] = article
    print(f"{len(articles)} articles charges.")

    print("Lecture des lignes suivi_tirage sans gamme...")
    rows = fetch_all(
        base_url, api_key, "suivi_tirage", "id,produit", extra_query="gamme=is.null"
    )
    print(f"{len(rows)} lignes a rattraper.")

    fixed = 0
    still_unmatched = 0
    unmatched_names: set[str] = set()

    for row in rows:
        article = article_by_fuzzy_name.get(fuzzy_key(row.get("produit")))
        if not article:
            still_unmatched += 1
            if row.get("produit"):
                unmatched_names.add(row["produit"])
            continue

        request_json(
            f"{base_url}/rest/v1/suivi_tirage?id=eq.{row['id']}",
            api_key,
            method="PATCH",
            payload={
                "gamme": article.get("gamme"),
                "type_article": article.get("type_article"),
                "piece_par_carton": article.get("piece_par_carton"),
            },
            extra_headers={"Prefer": "return=minimal"},
        )
        fixed += 1
        if fixed % 200 == 0:
            print(f"  ... {fixed} corrigees")

    print(f"Termine. {fixed} lignes corrigees, {still_unmatched} toujours sans article trouve.")
    if unmatched_names:
        print("\nNoms de produit non retrouves (echantillon) :")
        for name in list(unmatched_names)[:30]:
            print(" -", name)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
