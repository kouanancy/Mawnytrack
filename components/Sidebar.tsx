"use client";

import Link from "next/link";
import { Brand } from "@/components/Brand";
import { IcoLogout, IcoSettings } from "@/components/Icons";
import { SECTIONS, SETTINGS } from "@/lib/sections";
import { useNav } from "@/lib/use-nav";

/** Barre latérale fixe (tablette paysage et ordinateur, ≥ 1024 px) : remplace le menu à trois traits. */
export function Sidebar({ current }: { current: string }) {
  const { section, withMonth, signOut } = useNav(current);
  return (
    <nav className="sidebar noprint" aria-label="Sections">
      <Link href={withMonth("/depenses")} className="side-brand" aria-label="Mawnytrack, Dépenses">
        <Brand />
      </Link>
      <ul className="side-list">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={withMonth(s.href)} aria-current={s.href === section.href ? "page" : undefined}>
              <span className="on">{s.name}</span>
              {!s.ready && <span className="soon-tag">Bientôt</span>}
            </Link>
          </li>
        ))}
      </ul>
      <ul className="side-list side-foot">
        <li>
          <Link href={withMonth(SETTINGS.href)} aria-current={section.href === SETTINGS.href ? "page" : undefined}>
            <IcoSettings />
            <span className="on">{SETTINGS.name}</span>
          </Link>
        </li>
        <li>
          <button type="button" onClick={signOut}>
            <IcoLogout />
            <span className="on">Se déconnecter</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
