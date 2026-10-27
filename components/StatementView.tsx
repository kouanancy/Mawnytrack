"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";
import { IcoBack } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { printOrShare, sharePdf } from "@/lib/print";
import { fmt } from "@/lib/format";
import type { Movement, Person } from "@/lib/loans";
import { monthLabel } from "@/lib/month";

type Props = { person: Person; month: string; months: string[]; before: number; rows: Movement[] };

const pad = (n: number) => String(n).padStart(2, "0");

/** Relevé mensuel imprimable d'une personne (prêts ou emprunts). */
export function StatementView({ person: p, month, months, before, rows }: Props) {
  const router = useRouter();
  const L = p.direction === "lent";
  const [y, m] = month.split("-").map(Number);
  const tl = rows.filter((r) => r.type === "loan").reduce((a, r) => a + r.amount, 0);
  const tp = rows.filter((r) => r.type === "pay").reduce((a, r) => a + r.amount, 0);
  const end = Math.max(0, before + tl - tp);
  const toast = useToast();
  const pdf = {
    pdfUrl: `/prets/${p.id}/releve/pdf?m=${month}`,
    filename: `releve-${month}.pdf`,
    title: `Relevé ${L ? "de prêts" : "d'emprunts"} · ${p.name}`,
    notify: toast,
  };
  const lastDay = new Date(Date.UTC(y, m, 0)).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="statement">
      <div className="phead-bar noprint">
        <Link className="btn ghost sm" href={`/prets/${p.id}`}>
          <IcoBack /> {p.name}
        </Link>
      </div>
      <div className="row noprint" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "2 1 180px" }}>
          <label htmlFor="st-m">Mois du relevé</label>
          <select id="st-m" value={month} onChange={(e) => router.replace(`/prets/${p.id}/releve?m=${e.target.value}`, { scroll: false })}>
            {months.map((mo) => (
              <option key={mo} value={mo}>
                {monthLabel(mo)}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" type="button" style={{ flex: "1 1 120px" }} onClick={() => printOrShare(pdf)}>
          Imprimer
        </button>
        <button className="btn ghost" type="button" style={{ flex: "1 1 100px" }} onClick={() => sharePdf(pdf)}>
          PDF
        </button>
      </div>
      <article className="sheet">
        <div className="sh-head">
          <div>
            <Brand size={24} style={{ fontSize: 18 }} />
            <span>Relevé {L ? "de prêts" : "d'emprunts"}</span>
          </div>
          <div className="sh-who">
            <b>{p.name}</b>
            <span style={{ textTransform: "capitalize" }}>{monthLabel(month)}</span>
          </div>
        </div>
        <div className="sh-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Libellé</th>
                <th className="r">{L ? "Prêt" : "Emprunt"}</th>
                <th className="r">Remboursement</th>
              </tr>
            </thead>
            <tbody>
              <tr className="carry">
                <td>01/{pad(m)}</td>
                <td>Reste dû au début du mois</td>
                <td className="r num" colSpan={2}>
                  {fmt(before)}
                </td>
              </tr>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="num">
                      {r.day.slice(8, 10)}/{r.day.slice(5, 7)}
                    </td>
                    <td>{r.label || (r.type === "loan" ? (L ? "Prêt" : "Emprunt") : "Remboursement")}</td>
                    <td className="r num">{r.type === "loan" ? fmt(r.amount) : ""}</td>
                    <td className="r num">{r.type === "pay" ? fmt(r.amount) : ""}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="emptyrow">
                    Aucun mouvement sur ce mois.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2}>Total du mois</th>
                <th className="r num">{fmt(tl)}</th>
                <th className="r num">{fmt(tp)}</th>
              </tr>
              <tr className="end">
                <th colSpan={2}>Reste dû au {lastDay}</th>
                <th className="r num" colSpan={2}>
                  {fmt(end)} FCFA
                </th>
              </tr>
            </tfoot>
          </table>
        </div>
      </article>
    </div>
  );
}
