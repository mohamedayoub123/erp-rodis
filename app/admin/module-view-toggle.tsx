"use client";

// Case rapide devant chaque module : decochee, elle vide et desactive
// toutes les cases Voir/Modifier de ce module (pas la peine d'ouvrir le
// details pour tout decocher a la main).
export function ModuleViewToggle({ defaultChecked }: { defaultChecked: boolean }) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked;
    const container = event.target.closest("details");
    if (!container) return;

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
      defaultChecked={defaultChecked}
      onClick={(event) => event.stopPropagation()}
      onChange={handleChange}
      title="Voir ce module"
      className="h-4 w-4 shrink-0 rounded border-slate-400"
    />
  );
}
