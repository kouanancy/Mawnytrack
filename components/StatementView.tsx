"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brand } from "@/components/Brand";
import { IcoBack } from "@/components/Icons";
import { PdfPreview } from "@/components/PdfPreview";
import { fmt } from "@/lib/format";
import type { Person, StatementRow } from "@/lib/loans";
import type { PeriodSettings } from "@/lib/period";
import { buildStatement } from "@/lib/statement";

type Props = {
  person: Person;
  period: string;
  /** 12 dernières périodes du mois budgétaire : clé et libellé */
  months: { key: string; label: string }[];
  before: number;
  rows: StatementRow[];
  today: string;
  ps: PeriodSettings;
};

const n = (v: number | null) => (v == null ? "" : fmt(v));

/** Relevé d'une personne (un mois ou tout le relevé), avec aperçu avant impression ou partage. */
export function StatementView({ person: p, period, months, before, rows, today, ps }: Props) {
  const router = useRouter();
  const [preview, setPreview] = useState(false);
  const st = buildStatement({ name: p.name, direction: p.direction, period, before, rows, today, ps });

  return (
    <div className="statement">
      <div className="phead-bar noprint">
        <Link className="btn ghost sm" href={`/prets/${p.id}`}>
          <IcoBack /> {p.name}
        </Link>
      </div>
      <div className="row noprint" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "2 1 180px" }}>
          <label htmlFor="st-m">Période du relevé</label>
          <select
            id="st-m"
            value={period}
            onChange={(e) => router.replace(`/prets/${p.id}/releve?m=${e.target.value}`, { scroll: false })}
          >
            <option value="tout">Tout le relevé</option>
            {months.map((mo) => (
              <option key={mo.key} value={mo.key}>
                {mo.label}
              </option>
            ))}
          </select>
        </div>
        {/* Ouvre l'aperçu : Partager, Imprimer, Télécharger le PDF, Fermer */}
        <button className="btn nowrap" type="button" style={{ flex: "1 1 110px" }} onClick={() => setPreview(true)}>
          Imprimer
        </button>
      </div>
      <article className="sheet">
        <div className="sh-head">
          <div>
            <Brand size={24} style={{ fontSize: 18 }} />
            <span>{st.title}</span>
          </div>
          <div className="sh-who">
            <b>{p.name}</b>
            <span>{st.periodLabel}</span>
          </div>
        </div>
        <div className="sh-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Libellé</th>
                <th className="r">{st.loanLabel}</th>
                <th className="r">
                  <span className="th-long">Remboursement</span>
                  <span className="th-short" aria-hidden="true">
                    Remb.
                  </span>
                </th>
                <th className="r">Reste dû</th>
              </tr>
            </thead>
            <tbody>
              {st.empty && period === "tout" ? (
                <tr>
                  <td colSpan={5} className="emptyrow">
                    Aucun mouvement.
                  </td>
                </tr>
              ) : (
                st.rows.map((r, i) => {
                  switch (r.kind) {
                    case "carry":
                      return (
                        <tr className="carry" key={i}>
                          <td>{r.date}</td>
                          <td colSpan={3}>{r.label}</td>
                          <td className="r num">{fmt(r.balance)}</td>
                        </tr>
                      );
                    case "month":
                      return (
                        <tr className="st-month" key={i}>
                          <td colSpan={5}>{r.label}</td>
                        </tr>
                      );
                    case "move":
                      return (
                        <tr key={i}>
                          <td className="num">{r.date}</td>
                          <td>{r.label}</td>
                          <td className="r num">{n(r.loan)}</td>
                          <td className="r num">{n(r.pay)}</td>
                          <td className="r num">{fmt(r.balance)}</td>
                        </tr>
                      );
                    case "subtotal":
                      return (
                        <tr className="st-sub" key={i}>
                          <td colSpan={2}>{r.label}</td>
                          <td className="r num">{fmt(r.loan)}</td>
                          <td className="r num">{fmt(r.pay)}</td>
                          <td className="r num">{fmt(r.balance)}</td>
                        </tr>
                      );
                    default:
                      return null;
                  }
                })
              )}
              {!(st.empty && period === "tout") && st.empty && (
                <tr>
                  <td colSpan={5} className="emptyrow">
                    Aucun mouvement sur ce mois.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              {st.rows.map((r, i) =>
                r.kind === "total" ? (
                  <tr key={i}>
                    <th colSpan={2}>{r.label}</th>
                    <th className="r num">{fmt(r.loan)}</th>
                    <th className="r num">{fmt(r.pay)}</th>
                    <th />
                  </tr>
                ) : r.kind === "end" ? (
                  <tr className="end" key={i}>
                    <th colSpan={4}>{r.label}</th>
                    <th className="r num">{fmt(r.balance)} FCFA</th>
                  </tr>
                ) : null,
              )}
            </tfoot>
          </table>
        </div>
      </article>
      {preview && (
        <PdfPreview
          pdfUrl={`/prets/${p.id}/releve/pdf?m=${period}`}
          filename={st.filename}
          title={`${st.title} · ${p.name}`}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  );
}
