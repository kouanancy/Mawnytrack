"use client";

import { useMemo, useRef, useState } from "react";
import type { Line } from "@/lib/data";
import { matchParts, matches } from "@/lib/search";

const groupName = (l: Line) =>
  l.direction === "lent" ? "Prêts accordés" : l.direction === "borrowed" ? "Remboursements d'emprunts" : "Budget";

/** Lignes les plus utilisées récemment d'abord (nombre de dépenses sur 30 jours, puis dernière utilisation). */
const byUsage = (a: Line, b: Line) =>
  b.recentUses - a.recentUses || (b.lastUsed ?? "").localeCompare(a.lastUsed ?? "") || a.label.localeCompare(b.label, "fr");

/**
 * Choix de la ligne de budget par recherche (combobox) : suggestions dès la première lettre, sans tenir compte des
 * majuscules ni des accents, lettres tapées en gras, groupe en petit ; champ vide : 5 dernières lignes utilisées.
 * Flèches haut et bas, Entrée pour choisir, Échap pour fermer. Sans résultat : « Créer la ligne « … » ».
 */
export function LineCombobox({
  id,
  lines,
  value,
  onChange,
  onCreate,
}: {
  id: string;
  lines: Line[];
  value: string | null;
  onChange: (lineId: string) => void;
  onCreate: (label: string) => void;
}) {
  const selected = lines.find((l) => l.id === value) ?? null;
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = `${id}-list`;
  const query = dirty ? text.trim() : "";

  const options = useMemo(() => {
    if (!query) {
      const recent = lines.filter((l) => l.lastUsed).sort((a, b) => (b.lastUsed ?? "").localeCompare(a.lastUsed ?? ""));
      return (recent.length ? recent : lines).slice(0, 5);
    }
    return lines.filter((l) => matches(l.label, query)).sort(byUsage);
  }, [lines, query]);

  function choose(l: Line) {
    onChange(l.id);
    setDirty(false);
    setText("");
    setOpen(false);
  }

  function create() {
    if (!query) return;
    onCreate(query);
    setDirty(false);
    setText("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const n = options.length;
      if (n) setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      if (options[active]) choose(options[active]);
      else if (query) create();
    } else if (e.key === "Escape") {
      if (open) e.preventDefault();
      setOpen(false);
      setDirty(false);
      setText("");
    }
  }

  return (
    <div className="combo">
      <input
        id={id}
        ref={input}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${id}-opt-${options[active].id}` : undefined}
        autoComplete="off"
        placeholder="Rechercher une ligne…"
        value={dirty ? text : (selected?.label ?? "")}
        onFocus={(e) => {
          setOpen(true);
          setActive(0);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setOpen(false);
          setDirty(false);
          setText("");
        }}
        onClick={(e) => {
          // Champ affichant la ligne choisie : un clic sélectionne tout, la frappe remplace le nom
          if (!dirty) e.currentTarget.select();
          setOpen(true);
        }}
        onChange={(e) => {
          let v = e.target.value;
          // Lettres tapées à la suite du nom affiché (focus gardé après Échap) : elles commencent une nouvelle recherche
          if (!dirty && selected && v.length > selected.label.length && v.startsWith(selected.label)) v = v.slice(selected.label.length);
          setText(v);
          setDirty(true);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="combo-list" id={listId} role="listbox" aria-label="Lignes de budget">
          {!query && options.length > 0 && <li className="combo-head" role="presentation">{lines.some((l) => l.lastUsed) ? "Utilisées récemment" : "Lignes"}</li>}
          {options.map((l, i) => (
            <li
              key={l.id}
              id={`${id}-opt-${l.id}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(l)}
            >
              <span className="combo-name">
                {matchParts(l.label, query).map((p, k) => (p.hit ? <b key={k}>{p.text}</b> : <span key={k}>{p.text}</span>))}
              </span>
              <small>{groupName(l)}</small>
            </li>
          ))}
          {query && options.length === 0 && (
            <li className="combo-empty" role="presentation">
              <span>Aucune ligne trouvée</span>
              <button type="button" className="combo-create" onMouseDown={(e) => e.preventDefault()} onClick={create}>
                Créer la ligne « {query} »
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
