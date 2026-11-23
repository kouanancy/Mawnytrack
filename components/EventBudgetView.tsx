"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import {
  addEventItem,
  deleteEventBudget,
  deleteEventItem,
  duplicateEventBudget,
  reorderEventItems,
  updateEventBudget,
  updateEventItem,
} from "@/app/(app)/investissements/budget-actions";
import { IcoBack, IcoPrint, IcoTrash } from "@/components/Icons";
import { PdfPreview } from "@/components/PdfPreview";
import { useToast } from "@/components/Toast";
import { budgetFilename, eventDateLabel, groupItems, type EventBudget, type EventItem } from "@/lib/event-budgets";
import { fmt, formatInput, parseAmount, plural } from "@/lib/format";
import { tempId } from "@/lib/ledger";

type Op =
  | { type: "meta"; name?: string; eventDate?: string | null; notes?: string }
  | { type: "add"; item: EventItem }
  | { type: "edit"; item: EventItem }
  | { type: "delete"; id: string }
  | { type: "order"; ids: string[] };

function reduce(b: EventBudget, op: Op): EventBudget {
  switch (op.type) {
    case "meta":
      return {
        ...b,
        name: op.name ?? b.name,
        eventDate: op.eventDate === undefined ? b.eventDate : op.eventDate,
        notes: op.notes ?? b.notes,
      };
    case "add":
      return { ...b, items: [...b.items, op.item] };
    case "edit":
      return { ...b, items: b.items.map((i) => (i.id === op.item.id ? op.item : i)) };
    case "delete":
      return { ...b, items: b.items.filter((i) => i.id !== op.id) };
    case "order": {
      const pos = new Map(op.ids.map((id, k) => [id, k + 1]));
      return { ...b, items: b.items.map((i) => ({ ...i, position: pos.get(i.id) ?? i.position })) };
    }
  }
}

/**
 * Fiche d'un budget d'événement : nom et date modifiables, chiffres clés (Articles · Catégories · Total prévu),
 * articles par catégorie avec sous-totaux (modifiables, supprimables, ordre par glisser-déposer ou flèches du
 * clavier sur la poignée), ajout d'article avec suggestions de catégories, notes, duplication, suppression, PDF.
 */
export function EventBudgetView({ data, today }: { data: EventBudget; today: string }) {
  const router = useRouter();
  const [view, apply] = useOptimistic(data, reduce);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const [editMeta, setEditMeta] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [preview, setPreview] = useState(false);
  const [notes, setNotes] = useState(data.notes);
  // Glisser-déposer : ordre provisoire des articles d'une catégorie pendant le déplacement
  const [drag, setDrag] = useState<{ id: string; category: string; order: string[] } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { groups, total, count } = groupItems(view.items);
  const categories = groups.map((g) => g.category);
  const display = groups.map((g) =>
    drag && g.category === drag.category
      ? { ...g, items: drag.order.map((id) => g.items.find((i) => i.id === id)!).filter(Boolean) }
      : g,
  );

  function saveMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const eventDate = String(f.get("date") ?? "") || null;
    if (!name) return toast("Indiquez un nom");
    setEditMeta(false);
    startTransition(async () => {
      apply({ type: "meta", name, eventDate });
      const r = await updateEventBudget({ id: view.id, name, eventDate });
      toast(r.ok ? "Budget mis à jour" : r.error);
    });
  }

  function saveNotes() {
    if (notes === view.notes) return;
    startTransition(async () => {
      apply({ type: "meta", notes });
      const r = await updateEventBudget({ id: view.id, notes });
      toast(r.ok ? "Notes enregistrées" : r.error);
    });
  }

  function addItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const label = String(f.get("label") ?? "").trim();
    const category = String(f.get("category") ?? "").trim();
    const amount = parseAmount(String(f.get("amount") ?? ""));
    if (!label) return toast("Indiquez une désignation");
    if (!category) return toast("Indiquez une catégorie");
    (form.elements.namedItem("label") as HTMLInputElement).value = "";
    (form.elements.namedItem("amount") as HTMLInputElement).value = "";
    (form.elements.namedItem("label") as HTMLInputElement).focus();
    const position = Math.max(0, ...view.items.map((i) => i.position)) + 1;
    startTransition(async () => {
      apply({ type: "add", item: { id: tempId(), category, label, amount, position } });
      const r = await addEventItem({ budgetId: view.id, category, label, amount });
      toast(r.ok ? `Ajouté : ${label}` : r.error);
    });
  }

  function saveItem(item: EventItem, v: { label: string; amount: number; category: string }) {
    setEditing(null);
    startTransition(async () => {
      apply({ type: "edit", item: { ...item, ...v } });
      const r = await updateEventItem({ id: item.id, ...v });
      toast(r.ok ? "Article modifié" : r.error);
    });
  }

  function removeItem(id: string) {
    setConfirm(null);
    startTransition(async () => {
      apply({ type: "delete", id });
      const r = await deleteEventItem(id);
      toast(r.ok ? "Article supprimé" : r.error);
    });
  }

  /** Nouvel ordre d'une catégorie : l'ordre global suit les catégories, puis leurs articles. */
  function commitOrder(category: string, order: string[]) {
    const ids = groups.flatMap((g) => (g.category === category ? order : g.items.map((i) => i.id)));
    if (ids.some((id) => id.startsWith("tmp-"))) return;
    startTransition(async () => {
      apply({ type: "order", ids });
      const r = await reorderEventItems({ budgetId: view.id, ids });
      if (!r.ok) toast(r.error);
    });
  }

  // Déplacement au pointeur (souris et doigt) : l'article suit la position verticale parmi ceux de sa catégorie
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const els = [...(listRef.current?.querySelectorAll<HTMLElement>(`[data-cat="${CSS.escape(drag.category)}"] [data-item]`) ?? [])];
      const others = els.filter((el) => el.dataset.item !== drag.id);
      const idx = others.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      const rest = others.map((el) => el.dataset.item!);
      const order = idx < 0 ? [...rest, drag.id] : [...rest.slice(0, idx), drag.id, ...rest.slice(idx)];
      if (order.join() !== drag.order.join()) setDrag({ ...drag, order });
    };
    const up = () => {
      const original = groups.find((g) => g.category === drag.category)?.items.map((i) => i.id) ?? [];
      if (drag.order.join() !== original.join()) commitOrder(drag.category, drag.order);
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });

  /** Flèches du clavier sur la poignée : monter ou descendre l'article dans sa catégorie. */
  function keyMove(e: React.KeyboardEvent, item: EventItem, list: EventItem[]) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const ids = list.map((i) => i.id);
    const k = ids.indexOf(item.id), j = e.key === "ArrowUp" ? k - 1 : k + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[k], ids[j]] = [ids[j], ids[k]];
    commitOrder(item.category, ids);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-item="${item.id}"] .eb-handle`)?.focus());
  }

  function duplicate() {
    startTransition(async () => {
      const r = await duplicateEventBudget(view.id);
      if (!r.ok) return toast(r.error);
      toast("Budget dupliqué");
      router.push(`/investissements/budgets/${r.id}`);
    });
  }

  function removeBudget() {
    if (!askDelete) return setAskDelete(true);
    startTransition(async () => {
      const r = await deleteEventBudget(view.id);
      if (!r.ok) return toast(r.error);
      toast("Budget supprimé");
      router.replace("/investissements");
    });
  }

  return (
    <>
      <div className="phead-bar">
        <Link className="btn ghost sm" href="/investissements">
          <IcoBack /> Investissements
        </Link>
        <button type="button" className="iconbtn" aria-label="Imprimer ou partager le budget" title="Imprimer ou partager" onClick={() => setPreview(true)}>
          <IcoPrint />
        </button>
      </div>
      <div className="cols">
        <div className="stack col">
          {editMeta ? (
            <form className="quick" onSubmit={saveMeta} aria-label="Nom et date du budget">
              <div className="field">
                <label htmlFor="ebm-n">Nom</label>
                <input id="ebm-n" name="name" required maxLength={80} defaultValue={view.name} autoFocus />
              </div>
              <div className="field">
                <label htmlFor="ebm-d">Date de l&apos;événement (facultative)</label>
                <input id="ebm-d" name="date" type="date" defaultValue={view.eventDate ?? ""} />
              </div>
              <div className="confirm">
                <button className="btn sm" type="submit">
                  Enregistrer
                </button>
                <button className="btn sm ghost" type="button" onClick={() => setEditMeta(false)}>
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <section className="phead">
              <div className="avatar lg" aria-hidden="true">
                {view.name.trim().slice(0, 1).toUpperCase()}
              </div>
              <div>
                <h1>{view.name}</h1>
                <span>{view.eventDate ? eventDateLabel(view.eventDate) : "Date non fixée"}</span>
              </div>
              <button type="button" className="btn sm ghost" onClick={() => setEditMeta(true)}>
                Modifier
              </button>
            </section>
          )}
          <div className="sum three">
            <div>
              <span>Articles</span>
              <strong className="num">{count}</strong>
            </div>
            <div>
              <span>Catégories</span>
              <strong className="num">{groups.length}</strong>
            </div>
            <div>
              <span>Total prévu</span>
              <strong className="num" style={{ color: "var(--accent)" }}>
                {fmt(total)}
              </strong>
            </div>
          </div>
          <details className="add" open>
            <summary>+ Ajouter un article</summary>
            <form onSubmit={addItem}>
              <div className="row">
                <div className="field" style={{ flex: "2 1 160px" }}>
                  <label htmlFor="ebi-l">Désignation</label>
                  <input id="ebi-l" name="label" required maxLength={120} placeholder="Ex. boissons, location de chaises…" autoComplete="off" />
                </div>
                <div className="field amount">
                  <label htmlFor="ebi-a">Montant (FCFA)</label>
                  <input
                    id="ebi-a"
                    name="amount"
                    inputMode="numeric"
                    placeholder="0"
                    autoComplete="off"
                    onInput={(e) => (e.currentTarget.value = formatInput(e.currentTarget.value))}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="ebi-c">Catégorie</label>
                <input
                  id="ebi-c"
                  name="category"
                  required
                  maxLength={60}
                  list="eb-cats"
                  placeholder={categories[0] ? `Ex. ${categories[0]}` : "Ex. Boissons, Décoration…"}
                  defaultValue={categories.at(-1) ?? ""}
                  autoComplete="off"
                />
                <datalist id="eb-cats">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <button className="btn" type="submit">
                Ajouter
              </button>
            </form>
          </details>
          <div className="field eb-notes">
            <label htmlFor="eb-notes">Notes</label>
            <textarea
              id="eb-notes"
              rows={3}
              maxLength={2000}
              placeholder="Facultatif : lieu, invités, contacts…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
            />
          </div>
          <div className="pj-end">
            <div className="confirm" style={{ flexWrap: "wrap" }}>
              <button type="button" className="btn sm ghost" onClick={duplicate}>
                Dupliquer ce budget
              </button>
            </div>
            <div className="confirm" style={{ flexWrap: "wrap" }}>
              <button type="button" className={`btn sm ${askDelete ? "out" : "ghost"}`} onClick={removeBudget}>
                {askDelete ? "Confirmer la suppression du budget" : "Supprimer ce budget"}
              </button>
              {askDelete && (
                <button type="button" className="btn sm ghost" onClick={() => setAskDelete(false)}>
                  Annuler
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="col">
          <div className="sect">
            <h2>Articles</h2>
            <span>
              {count} {plural(count, "article", "articles")} · {fmt(total)} FCFA
            </span>
          </div>
          <div className="eb-list" ref={listRef}>
            {display.length ? (
              display.map((g) => (
                <div className="list eb-group" key={g.category} data-cat={g.category}>
                  <div className="eb-cat">
                    <span>{g.category}</span>
                    <span className="num">{fmt(g.subtotal)}</span>
                  </div>
                  {g.items.map((i) =>
                    editing === i.id ? (
                      <ItemEditor key={i.id} item={i} categories={categories} onSave={(v) => saveItem(i, v)} onCancel={() => setEditing(null)} />
                    ) : confirm === i.id ? (
                      <div className="item" key={i.id}>
                        <div className="meta">
                          <b>{i.label}</b>
                          <span>Supprimer cet article ?</span>
                        </div>
                        <div className="confirm">
                          <button type="button" className="btn sm out" autoFocus onClick={() => removeItem(i.id)}>
                            Supprimer
                          </button>
                          <button type="button" className="btn sm ghost" onClick={() => setConfirm(null)}>
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`item eb-item${drag?.id === i.id ? " dragging" : ""}`} key={i.id} data-item={i.id}>
                        <button
                          type="button"
                          className="eb-handle"
                          aria-label={`Déplacer ${i.label} (flèches haut et bas)`}
                          title="Glisser pour changer l'ordre"
                          disabled={i.id.startsWith("tmp-")}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            setDrag({ id: i.id, category: g.category, order: g.items.map((x) => x.id) });
                          }}
                          onKeyDown={(e) => keyMove(e, i, g.items)}
                        >
                          ⋮⋮
                        </button>
                        <button
                          type="button"
                          className="item-hit"
                          aria-label={`Modifier ${i.label}, ${fmt(i.amount)} FCFA`}
                          disabled={i.id.startsWith("tmp-")}
                          onClick={() => setEditing(i.id)}
                        >
                          <span className="meta">
                            <b>{i.label}</b>
                          </span>
                          <span className="amt num">{fmt(i.amount)}</span>
                        </button>
                        <button type="button" className="del" aria-label={`Supprimer ${i.label}`} onClick={() => setConfirm(i.id)}>
                          <IcoTrash />
                        </button>
                      </div>
                    ),
                  )}
                  <div className="eb-sub num">
                    <span>Sous-total {g.category}</span>
                    <span>{fmt(g.subtotal)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="list">
                <div className="empty">Aucun article. Ajoutez le premier : désignation, montant et catégorie.</div>
              </div>
            )}
            {count > 0 && (
              <div className="eb-total num">
                <span>Total prévu</span>
                <span>{fmt(total)} FCFA</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {preview && (
        <PdfPreview
          pdfUrl={`/investissements/budgets/${view.id}/pdf`}
          filename={budgetFilename(view.name, view.eventDate ?? today)}
          title={`Budget d'événement · ${view.name}`}
          onClose={() => setPreview(false)}
        />
      )}
    </>
  );
}

/** Modification d'un article dans la page : désignation, montant, catégorie ; Échap pour annuler. */
function ItemEditor({
  item,
  categories,
  onSave,
  onCancel,
}: {
  item: EventItem;
  categories: string[];
  onSave: (v: { label: string; amount: number; category: string }) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [amount, setAmount] = useState(fmt(item.amount));
  const [category, setCategory] = useState(item.category);
  const ok = label.trim() && category.trim();
  return (
    <div className="item editing">
      <form
        className="move-edit"
        aria-label={`Modifier : ${item.label}`}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSave({ label: label.trim(), amount: parseAmount(amount), category: category.trim() });
        }}
      >
        <div className="field">
          <label htmlFor={`ei-l-${item.id}`}>Désignation</label>
          <input id={`ei-l-${item.id}`} maxLength={120} autoFocus value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="row">
          <div className="field amount">
            <label htmlFor={`ei-a-${item.id}`}>Montant (FCFA)</label>
            <input id={`ei-a-${item.id}`} inputMode="numeric" value={amount} onChange={(e) => setAmount(formatInput(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor={`ei-c-${item.id}`}>Catégorie</label>
            <input id={`ei-c-${item.id}`} maxLength={60} list="eb-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
        </div>
        <div className="confirm">
          <button className="btn sm" type="submit" disabled={!ok}>
            Enregistrer
          </button>
          <button className="btn sm ghost" type="button" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
