"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { generateCurrentWeek } from "@/app/(app)/rapports/actions";
import { IcoChev } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { fmt } from "@/lib/format";
import { longDay } from "@/lib/month";
import type { ReportListItem } from "@/lib/report";

/** Liste des rapports hebdomadaires, du plus récent au plus ancien. */
export function ReportsList({ reports }: { reports: ReportListItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const r = await generateCurrentWeek();
      if (!r.ok) return toast(r.error);
      toast("Rapport de la semaine généré");
      router.push(`/rapports/${r.id}`);
    });
  }

  return (
    <div className="cols">
      <div className="stack col">
        <div className="quick">
          <p className="hint" style={{ margin: 0 }}>
            Un rapport est établi chaque dimanche à 20 h pour la semaine écoulée (du lundi au dimanche) et envoyé par
            e-mail, sauf si la semaine ne contient aucun mouvement. L&apos;envoi se règle dans Réglages › Notifications.
          </p>
          <button className="btn" type="button" onClick={generate} disabled={pending}>
            {pending ? "Préparation du rapport…" : "Générer le rapport de cette semaine"}
          </button>
        </div>
      </div>
      <div className="col">
        {reports.length ? (
          <div className="list">
            {reports.map((r) => (
              <Link key={r.id} href={`/rapports/${r.id}`} className="person">
                <div className="avatar" aria-hidden="true">
                  {r.weekEnd.slice(8, 10)}
                </div>
                <div className="meta">
                  <b>
                    Du {longDay(r.weekStart)} au {longDay(r.weekEnd)}
                  </b>
                  <span className="num">
                    Revenus {fmt(r.income)} · dépenses {fmt(r.expense)}
                    {r.sentAt ? " · envoyé par e-mail" : ""}
                  </span>
                </div>
                <IcoChev />
              </Link>
            ))}
          </div>
        ) : (
          <div className="list">
            <div className="empty">
              Aucun rapport pour le moment. Le premier sera établi dimanche soir, ou dès maintenant avec « Générer le
              rapport de cette semaine ».
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
