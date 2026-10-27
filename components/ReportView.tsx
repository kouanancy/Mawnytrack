"use client";

import Link from "next/link";
import { useState } from "react";
import { Brand } from "@/components/Brand";
import { IcoBack } from "@/components/Icons";
import { PdfPreview } from "@/components/PdfPreview";
import { reportFilename, reportPeriod, reportSections, type Section, type WeeklyReport } from "@/lib/report-model";

/** Cellules d'une ligne : les cellules null prolongent la précédente (colSpan), comme dans le PDF. */
function cellsOf(row: Section["rows"][number], cols: Section["columns"]) {
  const out: { text: string; span: number; align: "left" | "right" }[] = [];
  row.cells.forEach((c, i) => {
    if (c === null && out.length) out[out.length - 1].span++;
    else out.push({ text: c ?? "", span: 1, align: cols[i].align ?? "left" });
  });
  return out;
}

function Table({ s }: { s: Section }) {
  const row = (r: Section["rows"][number], k: number, foot = false) => {
    const Cell = foot ? "th" : "td";
    return (
      <tr key={k} className={r.style === "group" ? "st-month" : r.style === "alert" ? "rp-alert" : r.style === "total" ? "rp-total" : undefined}>
        {cellsOf(r, s.columns).map((c, i) => (
          <Cell key={i} colSpan={c.span} className={c.align === "right" ? "r num" : undefined}>
            {c.text}
          </Cell>
        ))}
      </tr>
    );
  };
  return (
    <section className="rp-section">
      <h2>{s.heading}</h2>
      {s.note && <p className={`hint${s.heading === "Budget" ? " bad" : ""}`}>{s.note}</p>}
      <div className="sh-scroll">
        <table>
          <thead>
            <tr>
              {s.columns.map((c, i) => (
                <th key={i} className={c.align === "right" ? "r" : undefined}>
                  {c.short ? (
                    <>
                      <span className="th-long">{c.label}</span>
                      <span className="th-short" aria-hidden="true">
                        {c.short}
                      </span>
                    </>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.rows.length ? (
              s.rows.map((r, k) => row(r, k))
            ) : (
              <tr>
                <td colSpan={s.columns.length} className="emptyrow">
                  {s.empty}
                </td>
              </tr>
            )}
          </tbody>
          {s.footer && <tfoot>{s.footer.map((r, k) => row(r, k, true))}</tfoot>}
        </table>
      </div>
    </section>
  );
}

/** Rapport hebdomadaire en page normale, avec « Imprimer » qui ouvre l'aperçu (Partager, Imprimer, PDF). */
export function ReportView({ id, data, sentAt }: { id: string; data: WeeklyReport; sentAt: string | null }) {
  const [preview, setPreview] = useState(false);
  const period = reportPeriod(data);
  return (
    <div className="statement report">
      <div className="phead-bar noprint">
        <Link className="btn ghost sm" href="/rapports">
          <IcoBack /> Rapports
        </Link>
        <button className="btn sm nowrap" type="button" onClick={() => setPreview(true)}>
          Imprimer
        </button>
      </div>
      <article className="sheet">
        <div className="sh-head">
          <div>
            <Brand size={24} style={{ fontSize: 18 }} />
            <span>Rapport de la semaine</span>
          </div>
          <div className="sh-who">
            <b>Rapport de la semaine</b>
            <span>{period}</span>
          </div>
        </div>
        {sentAt && <p className="hint noprint">Envoyé par e-mail.</p>}
        {reportSections(data).map((s) => (
          <Table key={s.heading} s={s} />
        ))}
      </article>
      {preview && (
        <PdfPreview
          pdfUrl={`/rapports/${id}/pdf`}
          filename={reportFilename(data)}
          title={`Rapport · ${period}`}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  );
}
