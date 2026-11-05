"use client";

// "Exporter en PDF" : ouvre la fenetre d'impression du navigateur, ou il suffit de choisir "Enregistrer au format PDF"
// comme imprimante (aucun PDF n'est fabrique sur le serveur : le PDF reprend la page telle qu'elle est a l'ecran, texte
// selectionnable, en couleurs). Le titre de la page devient le nom de fichier propose par le navigateur.
export function BoutonExportPdf({ nomFichier, label = "Exporter en PDF" }: { nomFichier: string; label?: string }) {
  function exporter() {
    const titreAvant = document.title;
    document.title = nomFichier;
    document.documentElement.setAttribute("data-print-mode", "pdf");

    function nettoyer() {
      document.documentElement.removeAttribute("data-print-mode");
      document.title = titreAvant;
      window.removeEventListener("afterprint", nettoyer);
    }
    window.addEventListener("afterprint", nettoyer);
    window.print();
  }

  return (
    <button
      type="button"
      onClick={exporter}
      className="no-print inline-flex items-center justify-center gap-3 rounded-full bg-emerald-600 px-7 py-4 text-lg font-black text-white shadow-md transition hover:bg-emerald-500"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M12 11v6" />
        <path d="m9.5 14.5 2.5 2.5 2.5-2.5" />
      </svg>
      {label}
    </button>
  );
}
