"use client";

import { useEffect, useRef } from "react";

/**
 * Panneau modal commun : monte du bas de l'écran sur téléphone, fenêtre centrée à partir de 768 px (`.rs-*`).
 * Fermeture par la croix, la touche Échap ou un appui à l'extérieur ; le focus reste dans le panneau et revient
 * ensuite à l'élément qui l'a ouvert. initialFocus : sélecteur du premier élément à recevoir le focus.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  initialFocus,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  initialFocus?: string;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (initialFocus ? panel.current?.querySelector<HTMLElement>(initialFocus) : null)?.focus() ?? closeBtn.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !panel.current) return;
      // Le focus reste dans le panneau
      const items = [...panel.current.querySelectorAll<HTMLElement>("button, input, select, a[href]")].filter(
        (el) => !(el as HTMLButtonElement).disabled,
      );
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.({ preventScroll: true });
    };
  }, [onClose, initialFocus]);

  return (
    <div className="rs-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rs-panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="rs-title">
        <div className="rs-head">
          <div>
            <h2 id="rs-title">{title}</h2>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <button type="button" className="iconbtn" ref={closeBtn} aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
