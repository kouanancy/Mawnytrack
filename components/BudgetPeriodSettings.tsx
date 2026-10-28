"use client";

import { useState, useTransition } from "react";
import { setBudgetPeriod, type SettingsResult } from "@/app/settings-actions";
import { useToast } from "@/components/Toast";
import { currentPeriod, periodName, periodRange, periodSpan, type PeriodNaming, type PeriodSettings } from "@/lib/period";

/** Réglages › Mois budgétaire : jour de début (1 à 28), nom de la période, aperçu immédiat, confirmation. */
export function BudgetPeriodSettings({ initial }: { initial: PeriodSettings }) {
  const toast = useToast();
  const [saved, setSaved] = useState(initial);
  const [startDay, setStartDay] = useState(initial.startDay);
  const [naming, setNaming] = useState<PeriodNaming>(initial.naming);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<SettingsResult | null>(null);
  const [pending, startTransition] = useTransition();

  const ps: PeriodSettings = { startDay, naming };
  const key = currentPeriod(ps);
  const changed = startDay !== saved.startDay || naming !== saved.naming;
  // Exemples des deux noms possibles, calculés pour le jour choisi
  const example = (n: PeriodNaming) => {
    const s = { startDay, naming: n };
    const k = currentPeriod(s);
    return `${periodRange(k, s)} = ${periodName(k).split(" ")[0]}`;
  };

  function save() {
    setConfirm(false);
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
        Pour des revenus reçus à date fixe (par exemple le 22), le mois peut commencer ce jour-là et finir la veille du
        même jour le mois suivant.
      </p>
      <div className="field">
        <label htmlFor="set-start">Le mois commence le</label>
        <select
          id="set-start"
          value={startDay}
          onChange={(e) => {
            setStartDay(Number(e.target.value));
            setConfirm(false);
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
      <div className="themes" role="radiogroup" aria-label="Nom de la période">
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
                setConfirm(false);
                setResult(null);
              }}
            />
            <span>
              {name} ({example(id)})
            </span>
          </label>
        ))}
      </div>
      <p className="set-preview" aria-live="polite">
        Mois en cours : <b>{periodName(key)}</b>, {periodSpan(key, ps)}
      </p>
      {confirm ? (
        <div className="danger-box">
          <p className="hint" style={{ color: "var(--ink)" }}>
            Les mois passés seront regroupés selon les nouvelles dates. Les budgets figés des mois terminés seront
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
        <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} disabled={!changed || pending} onClick={() => setConfirm(true)}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      )}
      {result && (
        <p className={result.ok ? "set-ok" : "set-err"} role={result.ok ? "status" : "alert"}>
          {result.ok ? result.message : result.error}
        </p>
      )}
    </section>
  );
}
