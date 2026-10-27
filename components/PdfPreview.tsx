"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";

type Props = { pdfUrl: string; filename: string; title: string; onClose: () => void };

/** Application ouverte depuis l'écran d'accueil (PWA) : window.print() n'y fonctionne pas sur iPhone. */
function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Rend chaque page du PDF en image (pdf.js, chargé seulement à l'ouverture de l'aperçu). */
async function renderPages(data: ArrayBuffer): Promise<{ url: string; w: number; h: number }[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    // Résolution suffisante pour l'impression et le zoom (≈ 200 dpi)
    const viewport = page.getViewport({ scale: 2.8 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("rendu"))), "image/png"));
    pages.push({ url: URL.createObjectURL(blob), w: canvas.width, h: canvas.height });
  }
  await doc.destroy();
  return pages;
}

/**
 * Aperçu plein écran du document tel qu'il sera imprimé ou envoyé (pages A4 défilables, zoom),
 * avec « Partager », « Imprimer », « Télécharger le PDF » et « Fermer ».
 */
export function PdfPreview({ pdfUrl, filename, title, onClose }: Props) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<{ url: string; w: number; h: number }[]>([]);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    let urls: string[] = [];
    setError(false);
    setPages([]);
    (async () => {
      try {
        const res = await fetch(pdfUrl, { credentials: "same-origin" });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const rendered = await renderPages(await blob.arrayBuffer());
        urls = rendered.map((p) => p.url);
        if (cancelled) return urls.forEach(URL.revokeObjectURL);
        setFile(new File([blob], filename, { type: "application/pdf" }));
        setPages(rendered);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach(URL.revokeObjectURL);
    };
  }, [pdfUrl, filename, attempt]);

  // Plein écran : défilement de la page bloqué, Échap pour fermer, classe utilisée par la feuille d'impression
  useEffect(() => {
    document.body.classList.add("pv-open");
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("pv-open");
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const download = useCallback(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [file, filename]);

  /** Partage du PDF (WhatsApp, e-mail, Fichiers…), appelé directement dans le clic ; sinon téléchargement. */
  const share = useCallback(
    (then?: string) => {
      if (!file) return;
      if (navigator.canShare?.({ files: [file] })) {
        navigator.share({ files: [file], title }).then(
          () => then && toast(then),
          (err: Error) => err?.name !== "AbortError" && toast("Le partage n'a pas abouti. Réessayez ou téléchargez le PDF."),
        );
        return;
      }
      download();
      toast("Partage indisponible sur cet appareil : le PDF a été téléchargé.");
    },
    [file, title, download, toast],
  );

  function print() {
    if (isStandalone() || typeof window.print !== "function") {
      // Application installée sur l'iPhone : l'impression passe par le menu de partage
      toast("Choisissez « Imprimer » dans le menu de partage.");
      share();
      return;
    }
    window.print();
  }

  const ready = pages.length > 0 && !!file;

  return createPortal(
    <div className="pv" role="dialog" aria-modal="true" aria-label={`Aperçu : ${title}`}>
      <div className="pv-top">
        <b>{title}</b>
        <div className="pv-zoom" role="group" aria-label="Zoom">
          <button type="button" className="iconbtn" aria-label="Réduire" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} disabled={!ready}>
            −
          </button>
          <span className="num">{Math.round(zoom * 100)} %</span>
          <button type="button" className="iconbtn" aria-label="Agrandir" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} disabled={!ready}>
            +
          </button>
        </div>
      </div>
      <div className="pv-pages">
        {error ? (
          <div className="pv-msg" role="alert">
            <p>Le document n&apos;a pas pu être préparé. Vérifiez la connexion et réessayez.</p>
            <button type="button" className="btn sm" onClick={() => setAttempt((a) => a + 1)}>
              Réessayer
            </button>
          </div>
        ) : !ready ? (
          <div className="pv-msg" role="status">
            Préparation du document…
          </div>
        ) : (
          pages.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.url}
              src={p.url}
              alt={`Page ${i + 1} sur ${pages.length}`}
              className="pv-page"
              style={{ width: `min(${100 * zoom}%, ${Math.round(820 * zoom)}px)`, aspectRatio: `${p.w} / ${p.h}` }}
            />
          ))
        )}
      </div>
      <div className="pv-bar">
        <button type="button" className="btn" onClick={() => share()} disabled={!ready}>
          Partager
        </button>
        <button type="button" className="btn ghost" onClick={print} disabled={!ready}>
          Imprimer
        </button>
        <button type="button" className="btn ghost" onClick={download} disabled={!ready}>
          Télécharger le PDF
        </button>
        <button type="button" className="btn ghost" ref={closeRef} onClick={onClose}>
          Fermer
        </button>
      </div>
      {/* Pages telles qu'elles seront imprimées : seule cette partie sort à l'impression */}
      <div className="pv-print" aria-hidden="true">
        {pages.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.url} src={p.url} alt="" />
        ))}
      </div>
    </div>,
    document.body,
  );
}
