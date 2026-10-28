"use client";

import { useState } from "react";
import { IcoTrash } from "@/components/Icons";
import { MoveEditForm, type MoveEdit } from "@/components/MoveEditForm";
import type { Entry } from "@/lib/data";
import { fmt } from "@/lib/format";
import { category, deleteNotice, isMove, isTemp, type MoveCtx } from "@/lib/ledger";
import { dayLabel } from "@/lib/month";

/**
 * Journal du mois groupé par jour, avec suppression confirmée dans la page. Les lignes liées à une personne
 * (prêts, emprunts, remboursements) s'ouvrent au toucher dans un formulaire de modification.
 */
export function Journal({
  entries,
  mode,
  today,
  empty,
  onDelete,
  moveCtx,
  onEdit,
}: {
  entries: Entry[];
  mode: "out" | "in";
  today: string;
  empty: string;
  onDelete: (id: string) => void;
  /** Contexte de contrôle d'un mouvement pour une nouvelle date (null : non modifiable) */
  moveCtx?: (e: Entry, date: string) => MoveCtx | null;
  onEdit?: (e: Entry, v: MoveEdit) => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const editable = (e: Entry) => !!onEdit && !!moveCtx && isMove(e) && !isTemp(e.id) && !!moveCtx(e, e.day);

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
                ) : editing === e.id && editable(e) ? (
                  <div className="item editing" key={e.id}>
                    <MoveEditForm
                      title={category(e)}
                      initial={{ amount: e.amount, label: e.label, date: e.day }}
                      today={today}
                      ctx={(date) => moveCtx!(e, date)!}
                      onCancel={() => setEditing(null)}
                      onSave={(v) => {
                        setEditing(null);
                        onEdit!(e, v);
                      }}
                    />
                  </div>
                ) : (
                  <Row key={e.id} e={e} onAsk={() => setConfirm(e.id)} onEdit={editable(e) ? () => setEditing(e.id) : undefined} />
                ),
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Row({ e, onAsk, onEdit }: { e: Entry; onAsk: () => void; onEdit?: () => void }) {
  const out = e.kind === "expense";
  const cat = category(e);
  // Saisie en cours d'envoi : affichée immédiatement, surlignée brièvement
  const pending = isTemp(e.id);
  const body = (
    <>
      <span className={`ico ${out ? "o" : "i"}`} aria-hidden="true">
        {cat.replace(/^(Prêt|Remboursement|Emprunt) · /, "").slice(0, 2)}
      </span>
      <span className="meta">
        <b>{e.label}</b>
        <span>
          {e.time} · {cat}
        </span>
      </span>
      <span className={`amt num ${out ? "o" : "i"}`}>
        {out ? "−" : "+"}
        {fmt(e.amount)}
      </span>
    </>
  );
  return (
    <div className={`item${pending ? " fresh" : ""}`}>
      {onEdit ? (
        <button type="button" className="item-hit" aria-label={`Modifier ${e.label}, ${fmt(e.amount)} FCFA`} onClick={onEdit}>
          {body}
        </button>
      ) : (
        body
      )}
      <button type="button" className="del" aria-label={`Supprimer ${e.label}`} disabled={pending} onClick={onAsk}>
        <IcoTrash />
      </button>
    </div>
  );
}
