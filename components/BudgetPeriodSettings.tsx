"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setBudgetPeriod, updatePeriod, type SettingsResult } from "@/app/settings-actions";
import { useToast } from "@/components/Toast";
import { addDays, monthLabel } from "@/lib/month";
import {
  chainEnd,
  longDate,
  periodDays,
  periodName,
  shortDay,
  type PeriodNaming,
  type PeriodSettings,
  type StoredPeriod,
} from "@/lib/period";

/**
 * Réglages › Mois budgétaire :
 * - « Le mois commence le » et le nom : valeur par défaut, qui propose seulement les dates des nouveaux mois ;
 * - « Dates des mois » : chaque période enregistrée, du plus récent au plus ancien, avec « Modifier » (nom,
 *   ouverture, clôture ; aperçu des mois voisins et confirmation dans la page).
 */
export function BudgetPeriodSettings({ ps }: { ps: PeriodSettings }) {
  const toast = useToast();
  const [saved, setSaved] = useState({ startDay: ps.startDay, naming: ps.naming });
  const [startDay, setStartDay] = useState(ps.startDay);
  const [naming, setNaming] = useState<PeriodNaming>(ps.naming);
  const [result, setResult] = useState<SettingsResult | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changed = startDay !== saved.startDay || naming !== saved.naming;
  const last = ps.periods[ps.periods.length - 1];
  // Prochain mois proposé avec la valeur choisie : lendemain de la dernière clôture, jusqu'à la veille du jour choisi
  const nextStart = last ? addDays(last.end, 1) : null;
  const nextEnd = nextStart ? chainEnd(nextStart, { startDay }) : null;

  function save() {
    startTransition(async () => {
      const r = await setBudgetPeriod({ startDay, naming });
      setResult(r);
      toast(r.ok ? r.message : r.error);
      if (r.ok) setSaved({ startDay, naming });
    });
  }

  return (
    <section className="card set" aria-labelledby="s-mois">
      <h2 id="s-mois">Mois budgétaire</h2>
      <p className="hint">
        Pour des revenus reçus à date fixe (par exemple le 22), le mois peut commencer ce jour-là. Cette valeur sert à
        proposer les dates des nouveaux mois ; les mois déjà enregistrés gardent leurs dates.
      </p>
      <div className="field">
        <label htmlFor="set-start">Le mois commence le</label>
        <select
          id="set-start"
          value={startDay}
          onChange={(e) => {
            setStartDay(Number(e.target.value));
            setResult(null);
          }}
        >
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d === 1 ? "1er (mois du calendrier)" : d}
            </option>
          ))}
        </select>
      </div>
      <div className="themes" role="radiogroup" aria-label="Nom des nouveaux mois">
        {(
          [
            ["end", "Mois de fin"],
            ["start", "Mois de début"],
          ] as [PeriodNaming, string][]
        ).map(([id, name]) => (
          <label key={id} className="theme-opt">
            <input
              type="radio"
              name="period-naming"
              value={id}
              checked={naming === id}
              onChange={() => {
                setNaming(id);
                setResult(null);
              }}
            />
            <span>{name}</span>
          </label>
        ))}
      </div>
      {nextStart && nextEnd && (
        <p className="set-preview" aria-live="polite">
          Prochain mois proposé : du <b>{longDate(nextStart)}</b> au <b>{longDate(nextEnd)}</b>
        </p>
      )}
      <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} disabled={!changed || pending} onClick={save}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
      {result && (
        <p className={result.ok ? "set-ok" : "set-err"} role={result.ok ? "status" : "alert"}>
          {result.ok ? result.message : result.error}
        </p>
      )}

      <h3 className="set-sub">Dates des mois</h3>
      <div className="list pd-list">
        {[...ps.periods].reverse().map((p) =>
          editing === p.id ? (
            <PeriodEditor key={p.id} p={p} ps={ps} onClose={() => setEditing(null)} />
          ) : (
            <div className="item" key={p.id}>
              <div className="meta">
                <b style={{ textTransform: "capitalize" }}>{periodName(p.key, ps)}</b>
                <span className="num">
                  du {longDate(p.start)} au {longDate(p.end)} · {periodDays(p.start, p.end)} jours
                  {p.closed && " · clôturé"}
                </span>
              </div>
              <button type="button" className="btn sm ghost" onClick={() => setEditing(p.id)}>
                Modifier
              </button>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

/** Modification d'une période : nom, ouverture, clôture, aperçu des mois voisins, confirmation dans la page. */
function PeriodEditor({ p, ps, onClose }: { p: StoredPeriod; ps: PeriodSettings; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(periodName(p.key, ps));
  const [start, setStart] = useState(p.start);
  const [end, setEnd] = useState(p.end);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const i = ps.periods.findIndex((x) => x.id === p.id);
  const prev = ps.periods[i - 1], next = ps.periods[i + 1];
  const label = (k: string) => periodName(k, ps);
  // Contrôles pendant la saisie (mêmes règles que le serveur)
  const problem = !start || !end
    ? "Indiquez les deux dates."
    : end < start
      ? "La clôture ne peut pas précéder l'ouverture."
      : prev && addDays(start, -1) < prev.start
        ? `Le mois « ${label(prev.key)} » deviendrait vide : l'ouverture doit être après le ${longDate(prev.start)}.`
        : next && addDays(end, 1) > next.end
          ? `Le mois « ${label(next.key)} » deviendrait vide : la clôture doit être avant le ${longDate(next.end)}.`
          : null;
  const datesChanged = start !== p.start || end !== p.end;
  const changed = datesChanged || name.trim() !== periodName(p.key, ps);
  // Aperçu : « octobre 2026 : 22 sept. – 23 oct. »
  const preview = [
    ...(prev && start !== p.start ? [{ k: prev.key, s: prev.start, e: addDays(start, -1) }] : []),
    { k: p.key, s: start, e: end, self: true },
    ...(next && end !== p.end ? [{ k: next.key, s: addDays(end, 1), e: next.end }] : []),
  ];

  function save() {
    setConfirm(false);
    startTransition(async () => {
      const r = await updatePeriod({ id: p.id, name: name.trim() || monthLabel(p.key), start, end });
      if (!r.ok) {
        setError(r.error);
        return toast(r.error);
      }
      toast(r.message);
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="item editing">
      <div className="move-edit">
        <b style={{ textTransform: "capitalize" }}>{label(p.key)}</b>
        <div className="field">
          <label htmlFor={`pn-${p.id}`}>Nom</label>
          <input id={`pn-${p.id}`} maxLength={40} value={name} onChange={(e) => (setName(e.target.value), setConfirm(false))} />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor={`ps-${p.id}`}>Ouverture</label>
            <input id={`ps-${p.id}`} type="date" value={start} onChange={(e) => (setStart(e.target.value), setConfirm(false), setError(null))} />
          </div>
          <div className="field">
            <label htmlFor={`pe-${p.id}`}>Clôture</label>
            <input id={`pe-${p.id}`} type="date" value={end} onChange={(e) => (setEnd(e.target.value), setConfirm(false), setError(null))} />
          </div>
        </div>
        {problem || error ? (
          <p className="hint" role="alert">
            <span className="bad">{problem ?? error}</span>
          </p>
        ) : (
          datesChanged && (
            <ul className="pd-preview num" aria-live="polite">
              {preview.map((x) => (
                <li key={x.k} className={x.self ? "self" : undefined}>
                  {label(x.k)} : {shortDay(x.s)} – {shortDay(x.e)}
                </li>
              ))}
            </ul>
          )
        )}
        {confirm ? (
          <div className="danger-box">
            <p className="hint" style={{ color: "var(--ink)" }}>
              Les mouvements de ces mois seront regroupés selon les nouvelles dates. Les montants de la caisse seront
              recalculés.
            </p>
            <div className="confirm" style={{ flexWrap: "wrap", marginTop: 10 }}>
              <button type="button" className="btn sm" onClick={save} disabled={pending} autoFocus>
                Confirmer
              </button>
              <button type="button" className="btn sm ghost" onClick={() => setConfirm(false)}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="confirm">
            <button
              type="button"
              className="btn sm"
              disabled={!changed || !!problem || pending}
              onClick={() => (datesChanged ? setConfirm(true) : save())}
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" className="btn sm ghost" onClick={onClose}>
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
