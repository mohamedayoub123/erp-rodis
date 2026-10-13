"use client";

// Case rapide devant chaque section ET chaque module : decochee, elle vide et desactive toutes les cases Voir/Modifier/
// Supprimer qu'elle couvre (pas la peine d'ouvrir le detail pour tout decocher a la main). Sur une SECTION (ex : Gestion
// Stock PF), elle decoche aussi les cases de tous les modules (Produit Fini...) qu'elle contient ; recochee, elle recoche
// ces cases de modules et reactive les cases des pages (qui restent a cocher une par une).
export function ModuleViewToggle({ defaultChecked }: { defaultChecked: boolean }) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked;
    const container = event.target.closest("details");
    if (!container) return;

    // les cases de modules contenus dans cette section (jamais la case qu'on vient de cliquer)
    container.querySelectorAll<HTMLInputElement>("input[data-module-toggle]").forEach((caseModule) => {
      if (caseModule !== event.target) caseModule.checked = checked;
    });

    const checkboxes = container.querySelectorAll<HTMLInputElement>("input.perm-checkbox");
    checkboxes.forEach((checkbox) => {
      checkbox.disabled = !checked;
      if (!checked) {
        checkbox.checked = false;
      }
    });
  }

  return (
    <input
      type="checkbox"
      data-module-toggle=""
      defaultChecked={defaultChecked}
      onClick={(event) => event.stopPropagation()}
      onChange={handleChange}
      title="Voir ce module"
      className="h-4 w-4 shrink-0 rounded border-slate-400"
    />
  );
}
