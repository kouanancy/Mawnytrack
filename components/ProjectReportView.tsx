"use client";

import Link from "next/link";
import { useState } from "react";
import { Brand } from "@/components/Brand";
import { IcoBack } from "@/components/Icons";
import { PdfPreview } from "@/components/PdfPreview";
import type { ProjectMove } from "@/lib/caisse";
import { fmt } from "@/lib/format";
import { buildProjectReport } from "@/lib/project-report";

const n = (v: number | null) => (v == null ? "" : fmt(v));

/** Rapport de la caisse d'un projet (complet ou après une sortie), avec aperçu avant impression ou partage. */
export function ProjectReportView({
  id,
  name,
  moves,
  after,
  today,
}: {
  id: string;
  name: string;
  moves: ProjectMove[];
  after: string | null;
  today: string;
}) {
  const [preview, setPreview] = useState(false);
  const r = buildProjectReport({ name, moves, after, today });
  const pdfUrl = `/investissements/${id}/rapport/pdf${r.after ? `?apres=${r.after}` : ""}`;

  return (
    <div className="statement">
      <div className="phead-bar noprint">
        <Link className="btn ghost sm" href={`/investissements/${id}`}>
          <IcoBack /> {name}
        </Link>
        {/* Ouvre l'aperçu : Partager, Imprimer, Télécharger le PDF, Fermer */}
        <button className="btn sm nowrap" type="button" onClick={() => setPreview(true)}>
          Imprimer
        </button>
      </div>
      <article className="sheet">
        <div className="sh-head">
          <div>
            <Brand size={24} style={{ fontSize: 18 }} />
            <span>{r.title}</span>
          </div>
          <div className="sh-who">
            <b>{name}</b>
            <span>{r.subtitle}</span>
          </div>
        </div>
        <div className="sh-scroll">
          <table className="pj-tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Libellé</th>
                <th className="r">Entrée</th>
                <th className="r">Sortie</th>
                <th className="r">Solde</th>
              </tr>
            </thead>
            <tbody>
              {r.lines.length ? (
                r.lines.map((l, i) => (
                  <tr key={i} className={l.highlight ? "pj-hl" : undefined}>
                    <td className="num">
                      <span className="th-long">{l.date}</span>
                      <span className="th-short">{l.short}</span>
                    </td>
                    <td>{l.label}</td>
                    <td className="r num">{n(l.in)}</td>
                    <td className="r num">{n(l.out)}</td>
                    <td className="r num">{fmt(l.balance)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="emptyrow">
                    Aucun mouvement.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2}>Totaux</th>
                <th className="r num">{fmt(r.totals.in)}</th>
                <th className="r num">{fmt(r.totals.out)}</th>
                <th />
              </tr>
              <tr className="end">
                <th colSpan={4}>{r.end.label}</th>
                <th className="r num">{fmt(r.end.balance)} FCFA</th>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="pj-note num">
          Alloué depuis la caisse : {fmt(r.summary.funded)} FCFA · Dépensé : {fmt(r.summary.spent)} FCFA · Restitué à la
          caisse : {fmt(r.summary.back)} FCFA
        </p>
      </article>
      {preview && <PdfPreview pdfUrl={pdfUrl} filename={r.filename} title={`${r.title} · ${name}`} onClose={() => setPreview(false)} />}
    </div>
  );
}
