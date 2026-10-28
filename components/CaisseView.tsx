import Link from "next/link";
import type { CaisseMonth } from "@/lib/caisse";
import { fmt, fmtNb } from "@/lib/format";
import { periodEndLabel, periodRange, type PeriodSettings } from "@/lib/period";

const shortMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }).replace(".", "");
};
const longMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
};
const kfmt = (v: number) => (Math.abs(v) >= 1000 ? `${fmt(v / 1000)} k` : fmt(v));

/** Graphique « Évolution » : caisse cumulée (courbe pleine + dégradé) et épargne du mois (pointillés). */
function Chart({ rows }: { rows: CaisseMonth[] }) {
  const W = 360, H = 210, pl = 46, pr = 14, pt = 16, pb = 30, iw = W - pl - pr, ih = H - pt - pb;
  const values = rows.flatMap((r) => [r.cum, r.saving]);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  // Graduation « ronde » proche du maximum (ex. 1 135 000 → 1 500 000)
  const step = Math.pow(10, Math.floor(Math.log10(max - min))) / 2;
  const top = Math.ceil(max / step) * step;
  const bottom = min < 0 ? Math.floor(min / step) * step : 0;
  const span = top - bottom || 1;
  const x = (i: number) => pl + (rows.length < 2 ? iw / 2 : (i * iw) / (rows.length - 1));
  const y = (v: number) => pt + ih - ((v - bottom) / span) * ih;
  const ticks = bottom < 0 ? [bottom, 0, top] : [0, top / 2, top];
  const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.cum).toFixed(1)}`);
  const mpts = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.saving).toFixed(1)}`);
  // Une étiquette de mois sur deux au-delà de 8 mois, pour rester lisible
  const every = rows.length > 8 ? Math.ceil(rows.length / 8) : 1;
  const last = rows.at(-1)!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Évolution de la caisse : ${fmt(last.cum)} FCFA cumulés`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} className="grid" />
          <text x={pl - 8} y={y(t) + 4} textAnchor="end" className="ax">
            {kfmt(t)}
          </text>
        </g>
      ))}
      <defs>
        <linearGradient id="caisse-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" className="g0" />
          <stop offset="1" className="g1" />
        </linearGradient>
      </defs>
      <polygon points={`${x(0)},${y(Math.max(0, bottom))} ${pts.join(" ")} ${x(rows.length - 1)},${y(Math.max(0, bottom))}`} fill="url(#caisse-grad)" />
      <polyline points={mpts.join(" ")} className="lm" />
      <polyline points={pts.join(" ")} className="lc" />
      {rows.map((r, i) => (
        <g key={r.month}>
          <circle cx={x(i)} cy={y(r.cum)} r={i === rows.length - 1 ? 5 : 3} className="pc" />
          {(i % every === 0 || i === rows.length - 1) && (
            <text x={x(i)} y={H - 10} textAnchor="middle" className="ax">
              {shortMonth(r.month)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

type Props = { months: CaisseMonth[]; saved: number; unspent: number; invested: number; available: number; ps: PeriodSettings };

/** « Épargne prévue 50 000 + non dépensé 20 000 » (période terminée) ou « … · non dépensé ajouté le 21 novembre 2026 ». */
function savingDetail(r: CaisseMonth, ps: PeriodSettings) {
  if (!r.closed) return `Épargne prévue ${fmtNb(r.planSaving)} · non dépensé ajouté le ${periodEndLabel(r.month, ps)}`;
  if (r.unspent < 0) return `Épargne prévue ${fmtNb(r.planSaving)} − dépenses hors budget ${fmtNb(-r.unspent)}`;
  return `Épargne prévue ${fmtNb(r.planSaving)} + non dépensé ${fmtNb(r.unspent)}`;
}

export function CaisseView({ months, saved, unspent, invested, available, ps }: Props) {
  const recent = [...months].reverse();
  return (
    <div className="cols">
      <div className="stack col">
        <section className="hero" aria-label="Disponible en caisse">
          <div className="lbl">Disponible en caisse</div>
          <div className={`big num${available < 0 ? " neg" : ""}`}>
            {fmt(available)}
            <small>FCFA</small>
          </div>
          <div className="pct">Épargnes supplémentaires cumulées, moins les sorties vers les investissements</div>
          {unspent !== 0 && (
            <div className="pct num">
              dont non dépensé : {unspent < 0 ? "−" : ""}
              {fmt(Math.abs(unspent))} FCFA
            </div>
          )}
          <div className="split">
            <div>
              <span>Total épargné</span>
              <strong className="num">+{fmt(saved)}</strong>
            </div>
            <div>
              <span>Total investi</span>
              <strong className="num">{invested ? `−${fmt(invested)}` : "0"}</strong>
            </div>
          </div>
          <Link className="hero-link" href="/investissements">
            <span>Investissements en cours</span>
            <span>Voir ›</span>
          </Link>
        </section>
        {months.length > 0 && (
          <div className="card chartcard">
            <div className="sect">
              <h2>Évolution</h2>
              <span className="legend">
                <i className="lgc" />
                Caisse <i className="lgm" />
                Épargne du mois
              </span>
            </div>
            <Chart rows={months} />
          </div>
        )}
      </div>
      <div className="col">
        {months.length ? (
          <>
            <div className="sect">
              <h2>Détail par mois</h2>
              <span>Du plus récent au plus ancien</span>
            </div>
            <div className="list">
              {recent.map((r) => (
                <div className="item" key={r.month}>
                  <div className="meta">
                    <b style={{ textTransform: "capitalize" }}>{longMonth(r.month)}</b>
                    {ps.startDay !== 1 && <span>{periodRange(r.month, ps)}</span>}
                    <span className="num">{savingDetail(r, ps)}</span>
                    <span className="num">
                      Revenus {fmt(r.income)} · budget {fmt(r.planned)} · dépensé {fmt(r.out)}
                      {r.invested > 0 && ` · investi ${fmt(r.invested)}`}
                    </span>
                  </div>
                  <div className="pr">
                    <span className="amt num i">+{fmt(r.saving)}</span>
                    <span className="num caisse-cum">
                      {r.closed ? "Caisse fin de mois" : "Caisse à ce jour"} {fmt(r.cum)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="list">
            <div className="empty">La caisse se remplira dès le premier mois où les revenus dépassent le budget prévu.</div>
          </div>
        )}
      </div>
    </div>
  );
}
