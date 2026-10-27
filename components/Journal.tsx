"use client";

import { useState } from "react";
import { IcoTrash } from "@/components/Icons";
import type { Entry } from "@/lib/data";
import { fmt } from "@/lib/format";
import { category, deleteNotice, isTemp } from "@/lib/ledger";
import { dayLabel } from "@/lib/month";

/** Journal du mois groupé par jour, avec suppression confirmée dans la page. */
export function Journal({
  entries,
  mode,
  today,
  empty,
  onDelete,
}: {
  entries: Entry[];
  mode: "out" | "in";
  today: string;
  empty: string;
  onDelete: (id: string) => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);

  if (!entries.length)
    return (
      <div className="list">
        <div className="empty">{empty}</div>
      </div>
    );

  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const g = groups.get(e.day);
    if (g) g.push(e);
    else groups.set(e.day, [e]);
  }
  const days = [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));

  return (
    <>
      {days.map(([day, items]) => {
        const total = items.reduce((a, e) => a + (e.kind === "refund" ? -e.amount : e.amount), 0);
        return (
          <div className="day" key={day}>
            <h3>
              <span>{dayLabel(day, today)}</span>
              <span className="num">
                {mode === "out" ? "−" : "+"}
                {fmt(total)}
              </span>
            </h3>
            <div className="list">
              {items.map((e) =>
                confirm === e.id ? (
                  <div className="item" key={e.id}>
                    <div className="meta">
                      <b>{e.label}</b>
                      <span>{deleteNotice(e)}</span>
                    </div>
                    <div className="confirm">
                      <button
                        type="button"
                        className="btn sm out"
                        autoFocus
                        onClick={() => {
                          setConfirm(null);
                          onDelete(e.id);
                        }}
                      >
                        Supprimer
                      </button>
                      <button type="button" className="btn sm ghost" onClick={() => setConfirm(null)}>
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <Row key={e.id} e={e} onAsk={() => setConfirm(e.id)} />
                ),
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Row({ e, onAsk }: { e: Entry; onAsk: () => void }) {
  const out = e.kind === "expense";
  const cat = category(e);
  // Saisie en cours d'envoi : affichée immédiatement, surlignée brièvement
  const pending = isTemp(e.id);
  return (
    <div className={`item${pending ? " fresh" : ""}`}>
      <div className={`ico ${out ? "o" : "i"}`} aria-hidden="true">
        {cat.replace(/^(Prêt|Remboursement|Emprunt) · /, "").slice(0, 2)}
      </div>
      <div className="meta">
        <b>{e.label}</b>
        <span>
          {e.time} · {cat}
        </span>
      </div>
      <div className={`amt num ${out ? "o" : "i"}`}>
        {out ? "−" : "+"}
        {fmt(e.amount)}
      </div>
      <button type="button" className="del" aria-label={`Supprimer ${e.label}`} disabled={pending} onClick={onAsk}>
        <IcoTrash />
      </button>
    </div>
  );
}
