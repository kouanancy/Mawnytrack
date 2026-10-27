"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { IcoBack, IcoCheck, IcoChev, IcoMenu } from "@/components/Icons";
import { authClient } from "@/lib/auth-client";
import { isValidMonth, monthLabel, shiftMonth } from "@/lib/month";
import { SECTIONS, sectionOf } from "@/lib/sections";

/** En-tête : menu des sections, logo, sélecteur de mois, puis titre de la section. */
export function Header({ current }: { current: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const section = sectionOf(pathname);
  const m = params.get("m");
  const month = isValidMonth(m) ? m : current;
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

  // Le mois choisi suit la navigation entre sections ; le mois en cours n'apparaît pas dans l'URL.
  const withMonth = (href: string, mo: string) => (mo === current ? href : `${href}?m=${mo}`);

  async function signOut() {
    setOpen(false);
    await authClient.signOut();
    router.replace("/connexion");
    router.refresh();
  }

  return (
    <div className="noprint stack">
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
                  {SECTIONS.map((s) => {
                    const here = s.href === section.href;
                    return (
                      <li key={s.href}>
                        <Link
                          href={withMonth(s.href, month)}
                          role="menuitem"
                          aria-current={here ? "page" : undefined}
                          onClick={() => setOpen(false)}
                        >
                          <span className="on">{s.name}</span>
                          {here ? <IcoCheck /> : !s.ready && <span className="soon-tag">Bientôt</span>}
                        </Link>
                      </li>
                    );
                  })}
                  <li className="sep" role="separator" />
                  <li>
                    <button type="button" role="menuitem" className="mitem" onClick={signOut}>
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
