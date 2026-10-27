"use client";

/** Application ouverte depuis l'écran d'accueil (PWA) : window.print() n'y fonctionne pas sur iPhone. */
function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Imprime la page. À appeler directement dans le gestionnaire de clic (sans await avant) :
 * window.print() n'est autorisé que pendant le geste de l'utilisateur.
 * Repli quand l'impression n'est pas disponible : PDF de même mise en page, proposé via le partage
 * du téléphone (Imprimer, Enregistrer dans Fichiers, Envoyer), sinon téléchargé.
 */
export function printOrShare(opts: { pdfUrl: string; filename: string; title: string; notify: (msg: string) => void }) {
  if (!isStandalone() && typeof window.print === "function") {
    window.print();
    return;
  }
  void sharePdf(opts);
}

export async function sharePdf({ pdfUrl, filename, title, notify }: { pdfUrl: string; filename: string; title: string; notify: (msg: string) => void }) {
  notify("Préparation du document…");
  try {
    const res = await fetch(pdfUrl, { credentials: "same-origin" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const file = new File([blob], filename, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    notify("Document téléchargé.");
  } catch (err) {
    // Partage annulé par l'utilisateur : rien à signaler
    if ((err as Error)?.name === "AbortError") return;
    notify("Le document n'a pas pu être préparé. Vérifiez la connexion et réessayez.");
  }
}
