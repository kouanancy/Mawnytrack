"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import {
  addCategory,
  addItem,
  deleteBudget,
  deleteCategory,
  deleteItem,
  duplicateBudget,
  renameBudget,
  renameCategory,
  reorderCategories,
  reorderItems,
  updateItem,
} from "@/app/(app)/investissements/budget-actions";
import { IcoBack, IcoChev, IcoPrint, IcoTrash } from "@/components/Icons";
import { PdfPreview } from "@/components/PdfPreview";
import { useToast } from "@/components/Toast";
import { budgetFilename, budgetTotals, type Budget, type BudgetItem } from "@/lib/budgets";
import { fmt, formatInput, parseAmount, plural } from "@/lib/format";
import { tempId } from "@/lib/ledger";

type Op =
  | { type: "name"; name: string }
  | { type: "addCat"; id: string; name: string }
  | { type: "renameCat"; id: string; name: string }
  | { type: "delCat"; id: string }
  | { type: "orderCats"; ids: string[] }
  | { type: "addItem"; catId: string; item: BudgetItem }
  | { type: "editItem"; item: BudgetItem }
  | { type: "delItem"; id: string }
  | { type: "orderItems"; catId: string; ids: string[] };

function reduce(b: Budget, op: Op): Budget {
  const cats = b.categories;
  switch (op.type) {
    case "name":
      return { ...b, name: op.name };
    case "addCat":
      return { ...b, categories: [...cats, { id: op.id, name: op.name, position: Math.max(0, ...cats.map((c) => c.position)) + 1, items: [] }] };
    case "renameCat":
      return { ...b, categories: cats.map((c) => (c.id === op.id ? { ...c, name: op.name } : c)) };
    case "delCat":
      return { ...b, categories: cats.filter((c) => c.id !== op.id) };
    case "orderCats": {
      const pos = new Map(op.ids.map((id, k) => [id, k + 1]));
      return { ...b, categories: cats.map((c) => ({ ...c, position: pos.get(c.id) ?? c.position })) };
    }
    case "addItem":
      return { ...b, categories: cats.map((c) => (c.id === op.catId ? { ...c, items: [...c.items, op.item] } : c)) };
    case "editItem":
      return { ...b, categories: cats.map((c) => ({ ...c, items: c.items.map((i) => (i.id === op.item.id ? op.item : i)) })) };
    case "delItem":
      return { ...b, categories: cats.map((c) => ({ ...c, items: c.items.filter((i) => i.id !== op.id) })) };
    case "orderItems": {
      const pos = new Map(op.ids.map((id, k) => [id, k + 1]));
      return {
        ...b,
        categories: cats.map((c) => (c.id === op.catId ? { ...c, items: c.items.map((i) => ({ ...i, position: pos.get(i.id) ?? i.position })) } : c)),
      };
    }
  }
}

type Drag = { kind: "cat"; id: string; order: string[] } | { kind: "item"; catId: string; id: string; order: string[] };

/**
 * Fiche d'un budget : nom modifiable, bandeau Catégories · Lignes · Total, catégories dépliables (plusieurs
 * ouvertes à la fois) avec leurs lignes, ajout enchaîné de lignes, création, renommage et suppression de catégories,
 * modification d'une ligne (appui sur le libellé ou appui long), glisser-déposer des lignes et des catégories
 * (ou flèches haut et bas sur les poignées), total, duplication, suppression, impression.
 */
export function BudgetDetailView({ data, today, fresh }: { data: Budget; today: string; fresh: boolean }) {
  const router = useRouter();
  const [view, apply] = useOptimistic(data, reduce);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [editName, setEditName] = useState(false);
  const [creating, setCreating] = useState(fresh && data.categories.length === 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmCat, setConfirmCat] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [preview, setPreview] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const press = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { categories, total, lines } = budgetTotals(view);
  // Ordre provisoire pendant un glisser-déposer
  const shownCats =
    drag?.kind === "cat" ? drag.order.map((id) => categories.find((c) => c.id === id)!).filter(Boolean) : categories;
  const itemsOf = (catId: string, items: BudgetItem[]) =>
    drag?.kind === "item" && drag.catId === catId ? drag.order.map((id) => items.find((i) => i.id === id)!).filter(Boolean) : items;

  // Champ à focaliser dès qu'il apparaît (la catégorie créée n'est rendue qu'au retour des données du serveur)
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      setFocusId(null);
    }
  });
  const focusLabel = (catId: string) => setFocusId(`bi-l-${catId}`);
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function saveName(name: string) {
    setEditName(false);
    const n = name.trim();
    if (!n || n === view.name) return;
    startTransition(async () => {
      apply({ type: "name", name: n });
      const r = await renameBudget(view.id, n);
      if (!r.ok) toast(r.error);
    });
  }

  function createCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (!name) return toast("Indiquez le nom de la catégorie");
    setCreating(false);
    const temp = tempId();
    startTransition(async () => {
      apply({ type: "addCat", id: temp, name });
      const r = await addCategory(view.id, name);
      if (!r.ok) return toast(r.error);
      // La nouvelle catégorie s'ouvre aussitôt, libellé de la première ligne prêt à la saisie
      setOpen((s) => new Set(s).add(r.id!));
      focusLabel(r.id!);
    });
  }

  function addLine(catId: string, form: HTMLFormElement) {
    const f = new FormData(form);
    const label = String(f.get("label") ?? "").trim();
    const amount = parseAmount(String(f.get("amount") ?? ""));
    if (!label) return toast("Indiquez un libellé");
    form.reset();
    focusLabel(catId);
    const cat = view.categories.find((c) => c.id === catId);
    const position = Math.max(0, ...(cat?.items.map((i) => i.position) ?? [])) + 1;
    startTransition(async () => {
      apply({ type: "addItem", catId, item: { id: tempId(), label, amount, position } });
      const r = await addItem(catId, label, amount);
      if (!r.ok) toast(r.error);
    });
  }

  function saveItem(item: BudgetItem, label: string, amount: number) {
    setEditing(null);
    startTransition(async () => {
      apply({ type: "editItem", item: { ...item, label, amount } });
      const r = await updateItem(item.id, label, amount);
      toast(r.ok ? "Ligne modifiée" : r.error);
    });
  }

  function removeItem(id: string) {
    setConfirmItem(null);
    startTransition(async () => {
      apply({ type: "delItem", id });
      const r = await deleteItem(id);
      toast(r.ok ? "Ligne supprimée" : r.error);
    });
  }

  function saveCatName(id: string, name: string) {
    setRenaming(null);
    const n = name.trim();
    if (!n) return;
    startTransition(async () => {
      apply({ type: "renameCat", id, name: n });
      const r = await renameCategory(id, n);
      toast(r.ok ? "Catégorie renommée" : r.error);
    });
  }

  function removeCategory(id: string) {
    setConfirmCat(null);
    startTransition(async () => {
      apply({ type: "delCat", id });
      const r = await deleteCategory(id);
      toast(r.ok ? "Catégorie supprimée" : r.error);
    });
  }

  function commit(d: Drag) {
    if (d.order.some((id) => id.startsWith("tmp-"))) return;
    startTransition(async () => {
      if (d.kind === "cat") {
        apply({ type: "orderCats", ids: d.order });
        const r = await reorderCategories(view.id, d.order);
        if (!r.ok) toast(r.error);
      } else {
        apply({ type: "orderItems", catId: d.catId, ids: d.order });
        const r = await reorderItems(d.catId, d.order);
        if (!r.ok) toast(r.error);
      }
    });
  }

  // Glisser-déposer au pointeur (souris ou doigt) : l'élément suit la position verticale parmi ses voisins
  useEffect(() => {
    if (!drag) return;
    const selector = drag.kind === "cat" ? "[data-bcat]" : `[data-bcat="${drag.catId}"] [data-bitem]`;
    const attr = drag.kind === "cat" ? "bcat" : "bitem";
    const move = (e: PointerEvent) => {
      const els = [...(listRef.current?.querySelectorAll<HTMLElement>(selector) ?? [])].filter((el) => el.dataset[attr] !== drag.id);
      const idx = els.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      const rest = els.map((el) => el.dataset[attr]!);
      const order = idx < 0 ? [...rest, drag.id] : [...rest.slice(0, idx), drag.id, ...rest.slice(idx)];
      if (order.join() !== drag.order.join()) setDrag({ ...drag, order });
    };
    const up = () => {
      const original =
        drag.kind === "cat"
          ? categories.map((c) => c.id)
          : (categories.find((c) => c.id === drag.catId)?.items.map((i) => i.id) ?? []);
      if (drag.order.join() !== original.join()) commit(drag);
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

  /** Flèches haut et bas sur une poignée : déplacer d'un rang. */
  function keyMove(e: React.KeyboardEvent, d: Drag) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const ids = [...d.order];
    const k = ids.indexOf(d.id), j = e.key === "ArrowUp" ? k - 1 : k + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[k], ids[j]] = [ids[j], ids[k]];
    commit({ ...d, order: ids });
    const sel = d.kind === "cat" ? `[data-bcat="${d.id}"] .bud-handle` : `[data-bitem="${d.id}"] .bud-handle`;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(sel)?.focus());
  }

  function duplicate() {
    startTransition(async () => {
      const r = await duplicateBudget(view.id);
      if (!r.ok) return toast(r.error);
      toast("Budget dupliqué");
      router.push(`/investissements/budgets/${r.id}`);
    });
  }

  function removeBudget() {
    if (!askDelete) return setAskDelete(true);
    startTransition(async () => {
      const r = await deleteBudget(view.id);
      if (!r.ok) return toast(r.error);
      toast("Budget supprimé");
      router.replace("/investissements?vue=budgets");
    });
  }

  return (
    <div className="bud-page">
      <div className="phead-bar">
        <Link className="btn ghost sm" href="/investissements?vue=budgets">
          <IcoBack /> Budgets
        </Link>
        <button type="button" className="iconbtn" aria-label="Imprimer ou partager le budget" title="Imprimer ou partager" onClick={() => setPreview(true)}>
          <IcoPrint />
        </button>
      </div>

      <header className="bud-title">
        {editName ? (
          <input
            className="bud-name-input"
            aria-label="Nom du budget"
            maxLength={80}
            defaultValue={view.name}
            autoFocus
            onBlur={(e) => saveName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditName(false);
            }}
          />
        ) : (
          <h1>
            <button type="button" className="bud-name" title="Modifier le nom" onClick={() => setEditName(true)}>
              {view.name}
            </button>
          </h1>
        )}
        <span>Budget</span>
      </header>

      <section className="hero bud-banner" aria-label="Chiffres du budget">
        <div>
          <span>Catégories</span>
          <strong className="num">{categories.length}</strong>
        </div>
        <div>
          <span>Lignes</span>
          <strong className="num">{lines}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong className="num">{fmt(total)}</strong>
        </div>
      </section>

      <div className="bud-cats" ref={listRef}>
        {shownCats.map((c) => {
          const isOpen = open.has(c.id);
          const temp = c.id.startsWith("tmp-");
          const items = itemsOf(c.id, c.items);
          return (
            <section key={c.id} className={`bud-cat${drag?.kind === "cat" && drag.id === c.id ? " dragging" : ""}`} data-bcat={c.id}>
              <div className="bud-cat-head">
                <button
                  type="button"
                  className="bud-handle"
                  aria-label={`Déplacer la catégorie ${c.name} (flèches haut et bas)`}
                  title="Glisser pour changer l'ordre"
                  disabled={temp}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDrag({ kind: "cat", id: c.id, order: categories.map((x) => x.id) });
                  }}
                  onKeyDown={(e) => keyMove(e, { kind: "cat", id: c.id, order: categories.map((x) => x.id) })}
                >
                  ⋮⋮
                </button>
                {renaming === c.id ? (
                  <input
                    className="bud-cat-input"
                    aria-label="Nom de la catégorie"
                    maxLength={60}
                    defaultValue={c.name}
                    autoFocus
                    onBlur={(e) => saveCatName(c.id, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <button type="button" className="bud-cat-toggle" aria-expanded={isOpen} disabled={temp} onClick={() => toggle(c.id)}>
                    <span className="meta">
                      <b>{c.name}</b>
                      <span>
                        {c.items.length} {plural(c.items.length, "ligne", "lignes")}
                      </span>
                    </span>
                    <span className="num bud-sub">{fmt(c.subtotal)}</span>
                    <span className="bud-chev" aria-hidden="true">
                      <IcoChev />
                    </span>
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="bud-cat-body">
                  {items.length ? (
                    <div className="bud-items">
                      {items.map((i) =>
                        editing === i.id ? (
                          <ItemEditor key={i.id} item={i} onSave={(l, a) => saveItem(i, l, a)} onCancel={() => setEditing(null)} />
                        ) : confirmItem === i.id ? (
                          <div className="item" key={i.id}>
                            <div className="meta">
                              <b>{i.label}</b>
                              <span>Supprimer cette ligne ?</span>
                            </div>
                            <div className="confirm">
                              <button type="button" className="btn sm out" autoFocus onClick={() => removeItem(i.id)}>
                                Supprimer
                              </button>
                              <button type="button" className="btn sm ghost" onClick={() => setConfirmItem(null)}>
                                Annuler
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            key={i.id}
                            className={`item bud-item${drag?.kind === "item" && drag.id === i.id ? " dragging" : ""}`}
                            data-bitem={i.id}
                            // Appui long sur la ligne : modification
                            onPointerDown={(e) => {
                              if ((e.target as HTMLElement).closest("button.bud-handle, button.del")) return;
                              clearTimeout(press.current);
                              press.current = setTimeout(() => !i.id.startsWith("tmp-") && setEditing(i.id), 550);
                            }}
                            onPointerUp={() => clearTimeout(press.current)}
                            onPointerLeave={() => clearTimeout(press.current)}
                            onPointerCancel={() => clearTimeout(press.current)}
                            onContextMenu={(e) => e.preventDefault()}
                          >
                            <button
                              type="button"
                              className="bud-handle"
                              aria-label={`Déplacer ${i.label} (flèches haut et bas)`}
                              title="Glisser pour changer l'ordre"
                              disabled={i.id.startsWith("tmp-")}
                              onPointerDown={(e) => {
                                e.preventDefault();
                                setDrag({ kind: "item", catId: c.id, id: i.id, order: c.items.map((x) => x.id) });
                              }}
                              onKeyDown={(e) => keyMove(e, { kind: "item", catId: c.id, id: i.id, order: c.items.map((x) => x.id) })}
                            >
                              ⋮⋮
                            </button>
                            <button
                              type="button"
                              className="bud-label"
                              aria-label={`Modifier ${i.label}, ${fmt(i.amount)} FCFA`}
                              disabled={i.id.startsWith("tmp-")}
                              onClick={() => setEditing(i.id)}
                            >
                              {i.label}
                            </button>
                            <span className="amt num">{fmt(i.amount)}</span>
                            <button type="button" className="del" aria-label={`Supprimer ${i.label}`} onClick={() => setConfirmItem(i.id)}>
                              <IcoTrash />
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="bud-empty">Aucune ligne. Ajoutez la première ci-dessous.</p>
                  )}
                  <form
                    className="bud-add"
                    aria-label={`Ajouter une ligne à ${c.name}`}
                    onSubmit={(e) => {
                      e.preventDefault();
                      addLine(c.id, e.currentTarget);
                    }}
                  >
                    <div className="field">
                      <label htmlFor={`bi-l-${c.id}`}>Libellé</label>
                      <input id={`bi-l-${c.id}`} name="label" maxLength={120} autoComplete="off" placeholder="Ex. cahiers" />
                    </div>
                    <div className="field amount">
                      <label htmlFor={`bi-a-${c.id}`}>Montant</label>
                      <input
                        id={`bi-a-${c.id}`}
                        name="amount"
                        inputMode="numeric"
                        placeholder="0"
                        autoComplete="off"
                        onInput={(e) => (e.currentTarget.value = formatInput(e.currentTarget.value))}
                      />
                    </div>
                    <button type="submit" className="btn bud-plus" aria-label="Ajouter la ligne">
                      +
                    </button>
                  </form>
                  {confirmCat === c.id ? (
                    <div className="danger-box bud-cat-confirm">
                      <p className="hint" style={{ color: "var(--ink)" }}>
                        Supprimer la catégorie « {c.name} » et ses {c.items.length} {plural(c.items.length, "ligne", "lignes")} ?
                      </p>
                      <div className="confirm" style={{ marginTop: 8 }}>
                        <button type="button" className="btn sm out" onClick={() => removeCategory(c.id)}>
                          Supprimer
                        </button>
                        <button type="button" className="btn sm ghost" onClick={() => setConfirmCat(null)}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bud-cat-actions">
                      <button type="button" onClick={() => setRenaming(c.id)}>
                        Renommer
                      </button>
                      <button type="button" onClick={() => setConfirmCat(c.id)}>
                        Supprimer la catégorie
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {creating ? (
        <form className="quick bud-newcat" onSubmit={createCategory} aria-label="Nouvelle catégorie">
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "3 1 160px" }}>
              <label htmlFor="bc-n">Nom de la catégorie</label>
              <input
                id="bc-n"
                name="name"
                maxLength={60}
                autoFocus
                autoComplete="off"
                placeholder="Ex. Fournitures"
                onKeyDown={(e) => e.key === "Escape" && setCreating(false)}
              />
            </div>
            <button className="btn" type="submit" style={{ flex: "1 0 auto", height: 44 }}>
              Créer
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="bud-addcat" onClick={() => setCreating(true)}>
          + Créer une catégorie
        </button>
      )}

      <div className="bud-total num">
        <span>Total du budget</span>
        <span>{fmt(total)} FCFA</span>
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

      {preview && (
        <PdfPreview
          pdfUrl={`/investissements/budgets/${view.id}/pdf`}
          filename={budgetFilename(view.name, today)}
          title={`Budget · ${view.name}`}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  );
}

/** Modification d'une ligne dans la page : libellé et montant ; Échap pour annuler. */
function ItemEditor({ item, onSave, onCancel }: { item: BudgetItem; onSave: (label: string, amount: number) => void; onCancel: () => void }) {
  const [label, setLabel] = useState(item.label);
  const [amount, setAmount] = useState(fmt(item.amount));
  return (
    <div className="item editing">
      <form
        className="move-edit"
        aria-label={`Modifier : ${item.label}`}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) onSave(label.trim(), parseAmount(amount));
        }}
      >
        <div className="row">
          <div className="field" style={{ flex: "2 1 160px" }}>
            <label htmlFor={`be-l-${item.id}`}>Libellé</label>
            <input id={`be-l-${item.id}`} maxLength={120} autoFocus value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="field amount">
            <label htmlFor={`be-a-${item.id}`}>Montant</label>
            <input id={`be-a-${item.id}`} inputMode="numeric" value={amount} onChange={(e) => setAmount(formatInput(e.target.value))} />
          </div>
        </div>
        <div className="confirm">
          <button className="btn sm" type="submit" disabled={!label.trim()}>
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
