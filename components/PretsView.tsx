"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { addBorrow, addLentPerson } from "@/app/(app)/prets/actions";
import { IcoChev } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import type { Direction } from "@/lib/data";
import { fmt, formatInput, parseAmount } from "@/lib/format";
import type { Person } from "@/lib/loans";
import { tempId } from "@/lib/ledger";

type Op = { type: "person"; person: Person } | { type: "borrow"; name: string; amount: number };

function reducePeople(people: Person[], op: Op): Person[] {
  if (op.type === "person") return [...people, op.person];
  const key = op.name.trim().toLowerCase();
  const found = people.find((p) => p.direction === "borrowed" && p.name.trim().toLowerCase() === key);
  if (found) return people.map((p) => (p === found ? { ...p, total: p.total + op.amount, due: p.due + op.amount } : p));
  return [...people, { id: tempId(), name: op.name, direction: "borrowed", lineId: null, total: op.amount, back: 0, due: op.amount }];
}

/** Liste des prêts : tuiles, bascule prêté / emprunté, une ligne par personne, ajout. */
export function PretsView({ people, dir, today }: { people: Person[]; dir: Direction; today: string }) {
  const [view, addOp] = useOptimistic(people, reducePeople);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const lent = dir === "lent";

  const due = (d: Direction) => view.filter((p) => p.direction === d).reduce((a, p) => a + p.due, 0);
  const list = view
    .filter((p) => p.direction === dir)
    .sort((a, b) => Number(b.due > 0) - Number(a.due > 0) || b.due - a.due || a.name.localeCompare(b.name, "fr"));

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return toast("Indiquez un nom");
    if (lent) {
      form.reset();
      startTransition(async () => {
        addOp({ type: "person", person: { id: tempId(), name, direction: "lent", lineId: null, total: 0, back: 0, due: 0 } });
        const r = await addLentPerson(name);
        toast(r.ok ? `${name} ajouté(e) à la liste des lignes` : r.error);
      });
      return;
    }
    const amount = parseAmount(String(f.get("amount") ?? ""));
    if (!amount) return toast("Indiquez un montant");
    const date = String(f.get("date") ?? "") || today;
    form.reset();
    startTransition(async () => {
      addOp({ type: "borrow", name, amount });
      const r = await addBorrow({ name, amount, date, label: "Emprunt" });
      toast(r.ok ? `Emprunt enregistré · ${name} ajouté(e) aux lignes de remboursement` : r.error);
    });
  }

  return (
    <div className="cols">
      <div className="stack col">
        <div className="tiles">
          <div className="tile">
            <span>À recevoir</span>
            <strong className="num" style={{ color: "var(--in)" }}>
              {fmt(due("lent"))}
            </strong>
          </div>
          <div className="tile">
            <span>À rembourser</span>
            <strong className="num" style={{ color: "var(--out)" }}>
              {fmt(due("borrowed"))}
            </strong>
          </div>
        </div>
        <div className="seg" role="group" aria-label="Sens du prêt">
          <Link href="/prets" aria-pressed={lent} className="seg-link" replace scroll={false}>
            Argent prêté
          </Link>
          <Link href="/prets?sens=emprunte" aria-pressed={!lent} className="seg-link" replace scroll={false}>
            Argent emprunté
          </Link>
        </div>
        <details className="add" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary>+ {lent ? "Ajouter une personne" : "Nouvel emprunt"}</summary>
          <form onSubmit={submit} key={dir}>
            {lent ? (
              <>
                <div className="field">
                  <label htmlFor="p-n">Nom</label>
                  <input id="p-n" name="name" required maxLength={80} placeholder="Nom de la personne" autoComplete="off" />
                </div>
                <p className="hint">
                  Le nom apparaît ensuite dans la liste des lignes, côté Dépenses. Chaque dépense attribuée à ce nom
                  s&apos;ajoute ici comme un nouveau prêt.
                </p>
              </>
            ) : (
              <>
                <div className="row">
                  <div className="field">
                    <label htmlFor="p-n">Prêteur</label>
                    <input id="p-n" name="name" required maxLength={80} placeholder="Nom" autoComplete="off" />
                  </div>
                  <div className="field amount">
                    <label htmlFor="p-a">Montant (FCFA)</label>
                    <input
                      id="p-a"
                      name="amount"
                      inputMode="numeric"
                      required
                      placeholder="0"
                      autoComplete="off"
                      onInput={(e) => (e.currentTarget.value = formatInput(e.currentTarget.value))}
                    />
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label htmlFor="p-d">Date</label>
                    <input id="p-d" name="date" type="date" defaultValue={today} max={today} />
                  </div>
                </div>
                <p className="hint">
                  Le montant s&apos;ajoute aux revenus du mois et à la somme à rendre. Les remboursements se saisissent
                  côté Dépenses, sur la ligne au nom du prêteur.
                </p>
              </>
            )}
            <button className="btn" type="submit">
              Enregistrer
            </button>
          </form>
        </details>
      </div>

      <div className="col">
        {list.length ? (
          <div className="list">
            {list.map((p) => (
              <Link key={p.id} className="person" href={`/prets/${p.id}`} aria-disabled={p.id.startsWith("tmp-")}>
                <div className="avatar" aria-hidden="true">
                  {p.name.trim().slice(0, 1).toUpperCase()}
                </div>
                <div className="meta">
                  <b>{p.name}</b>
                  <span className="num">
                    {fmt(p.total)} {lent ? "prêtés" : "empruntés"} · {fmt(p.back)} remboursés
                  </span>
                </div>
                <div className="pr">
                  <span className="num amt">{fmt(p.due)}</span>
                  {p.due <= 0 ? <span className="pill ok">Soldé</span> : <span className="pill run">En cours</span>}
                </div>
                <IcoChev />
              </Link>
            ))}
          </div>
        ) : (
          <div className="list">
            <div className="empty">
              {lent
                ? "Aucune personne pour le moment. Ajoutez une personne pour suivre l'argent prêté."
                : "Aucun emprunt pour le moment. Enregistrez un nouvel emprunt pour suivre l'argent à rendre."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
