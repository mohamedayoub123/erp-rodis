"use client";

// Icone corbeille partagee par toute l'appli (BC/Import, Stock, Depots,
// Commandes, Articles...) - demande explicite : toute suppression doit
// d'abord demander une autorisation oui/non, jamais partir directement.
// Un seul window.confirm() ici protege tous les appelants d'un coup, sans
// avoir a modifier chacun des ~40 endroits qui l'utilisent.
export function DeleteIconButton({
  label = "Supprimer",
  confirmMessage,
  formAction,
  formNoValidate,
  name,
  value,
}: {
  label?: string;
  confirmMessage?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  formNoValidate?: boolean;
  name?: string;
  value?: string | number;
}) {
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      formAction={formAction}
      formNoValidate={formNoValidate}
      name={name}
      value={value}
      onClick={(event) => {
        if (!window.confirm(confirmMessage || `${label} ? Cette action est definitive.`)) {
          event.preventDefault();
        }
      }}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-700 transition hover:bg-red-50"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    </button>
  );
}
