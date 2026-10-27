"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { IcoBack, IcoCheck, IcoChev, IcoMenu } from "@/components/Icons";
import { monthLabel, shiftMonth } from "@/lib/month";
import { SECTIONS, SETTINGS } from "@/lib/sections";
import { useNav } from "@/lib/use-nav";

/**
 * En-tête : menu à trois traits (téléphone et tablette portrait), logo, sélecteur de mois, puis titre de
 * la section. Sur grand écran, le menu et le logo passent dans la barre latérale (voir globals.css).
 */
export function Header({ current }: { current: string }) {
  const { pathname, section, month, withMonth, signOut } = useNav(current);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = (s: typeof SETTINGS) => {
    const here = s.href === section.href;
    return (
      <li key={s.href}>
        <Link href={withMonth(s.href)} role="menuitem" aria-current={here ? "page" : undefined} onClick={() => setOpen(false)}>
          <span className="on">{s.name}</span>
          {here ? <IcoCheck /> : !s.ready && <span className="soon-tag">Bientôt</span>}
        </Link>
      </li>
    );
  };

  return (
    <div className="noprint stack page-head">
      <header className="top">
        <div className="lead">
          <div className="mdrop" ref={wrap}>
            <button
              ref={btn}
              type="button"
              className="mbtn"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={`Menu des sections (actuelle : ${section.name})`}
              onClick={() => setOpen((o) => !o)}
            >
              <IcoMenu />
            </button>
            {open && (
              <div className="fpop mpop" role="menu">
                <ul>
                  {SECTIONS.map(item)}
                  <li className="sep" role="separator" />
                  {item(SETTINGS)}
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      className="mitem"
                      onClick={() => {
                        setOpen(false);
                        signOut();
                      }}
                    >
                      <span className="on">Se déconnecter</span>
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </div>
          <Brand />
        </div>
        {section.month && (
          <div className="month">
            <Link href={withMonth(pathname, shiftMonth(month, -1))} aria-label="Mois précédent" scroll={false}>
              <IcoBack />
            </Link>
            <b>{monthLabel(month)}</b>
            <Link href={withMonth(pathname, shiftMonth(month, 1))} aria-label="Mois suivant" scroll={false}>
              <IcoChev />
            </Link>
          </div>
        )}
      </header>
      <h1 className="section-title">{section.name}</h1>
    </div>
  );
}
