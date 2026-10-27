"use client";

import { useEffect, useRef, useState } from "react";
import { IcoCheck, IcoDown, IcoFilter } from "@/components/Icons";
import type { Line } from "@/lib/data";
import { lineGroups } from "@/lib/ledger";

/** Bouton « Catégories » : liste déroulante personnalisée (nom seul) qui filtre le journal. */
export function CategoryFilter({
  lines,
  value,
  onChange,
}: {
  lines: Line[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const current = value ? lines.find((l) => l.id === value)?.label : null;

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function pick(id: string | null) {
    onChange(id);
    setOpen(false);
    btn.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      btn.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const opts = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const i = opts.indexOf(document.activeElement as HTMLElement);
    opts[(i + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length]?.focus();
  }

  const option = (id: string | null, name: string, dot: string) => {
    const selected = (value ?? null) === id;
    return (
      <li key={id ?? "all"}>
        <button type="button" role="option" aria-selected={selected} onClick={() => pick(id)}>
          <i className={`dot ${dot}`} aria-hidden="true" />
          <span className="on">{name}</span>
          {selected ? <IcoCheck /> : <b className="ck" />}
        </button>
      </li>
    );
  };

  return (
    <div className="fdrop" ref={wrap} onKeyDown={onKey}>
      <button
        ref={btn}
        type="button"
        className="fbtn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Catégories : ${current ?? "toutes les catégories"}`}
        onClick={() => setOpen((o) => !o)}
      >
        <IcoFilter />
        <span>{current ?? "Catégories"}</span>
        <IcoDown />
      </button>
      {open && (
        <div className="fpop" role="listbox" aria-label="Catégories">
          <ul>
            {option(null, "Toutes les catégories", "all")}
            {lineGroups(lines).map((g, gi) =>
              g.lines.length ? (
                <li key={g.name} role="presentation">
                  <div className="gh">{g.name}</div>
                  <ul style={{ padding: 0 }}>{g.lines.map((l) => option(l.id, l.label, gi === 1 ? "p" : "b"))}</ul>
                </li>
              ) : null,
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
