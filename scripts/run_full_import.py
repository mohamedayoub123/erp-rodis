import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path


def write_status(status_path: Path, state: str, message: str, details: str = "") -> None:
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(
        json.dumps(
            {
                "state": state,
                "message": message,
                "details": details,
                "updatedAt": datetime.utcnow().isoformat() + "Z",
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def run_step(project_root: Path, script_name: str, workbook_path: Path) -> str:
    script_path = project_root / "scripts" / script_name
    result = subprocess.run(
        [sys.executable, str(script_path), str(workbook_path)],
        cwd=project_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )

    output = "\n".join(
        part.strip() for part in [result.stdout, result.stderr] if part and part.strip()
    ).strip()

    if result.returncode != 0:
        raise RuntimeError(output or f"Echec script {script_name}")

    return output


def main() -> int:
    project_root = Path(__file__).resolve().parents[1]
    workbook_path = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    status_path = Path(sys.argv[2]) if len(sys.argv) > 2 else project_root / "storage" / "import-status.json"

    if workbook_path is None or not workbook_path.exists():
        write_status(status_path, "error", "Fichier Excel introuvable.", str(workbook_path or ""))
        return 1

    try:
        write_status(status_path, "running", "Import Data en cours...")
        articles_output = run_step(project_root, "import_articles.py", workbook_path)

        write_status(status_path, "running", "Import Stock en cours...", articles_output)
        lots_output = run_step(project_root, "import_lots_stock.py", workbook_path)

        details = "\n\n".join(part for part in [articles_output, lots_output] if part).strip()
        write_status(status_path, "success", "Import Excel termine avec succes.", details)
        return 0
    except Exception as exc:
        write_status(status_path, "error", "Import Excel a echoue.", str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
