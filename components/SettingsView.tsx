"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteAccount,
  resetAccount,
  sendTestReport,
  setWeeklyEmail,
  sendPasswordLink,
  setTheme,
  signOutEverywhere,
  updateEmail,
  updateName,
  type SettingsResult,
} from "@/app/settings-actions";
import { PasswordInput } from "@/components/PasswordInput";
import { useToast } from "@/components/Toast";
import { authClient } from "@/lib/auth-client";
import type { Theme } from "@/lib/theme";

type Props = { name: string; email: string; theme: Theme; weeklyEmail: boolean; version: string };

const THEME_OPTIONS: { id: Theme; name: string }[] = [
  { id: "auto", name: "Automatique (selon l'appareil)" },
  { id: "light", name: "Clair" },
  { id: "dark", name: "Sombre" },
];

/** Message de résultat affiché sous un formulaire. */
function Feedback({ res }: { res: SettingsResult | null }) {
  if (!res) return null;
  return res.ok ? (
    <p className="set-ok" role="status">
      {res.message}
    </p>
  ) : (
    <p className="set-err" role="alert">
      {res.error}
    </p>
  );
}

export function SettingsView({ name, email, theme, weeklyEmail, version }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<Record<string, SettingsResult | null>>({});
  const [currentTheme, setCurrentTheme] = useState<Theme>(theme);
  const [weekly, setWeekly] = useState(weeklyEmail);
  const [danger, setDanger] = useState<"reset" | "delete" | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  /** Lance une action serveur, affiche son résultat sous le formulaire et en message bref. */
  function run(key: string, action: () => Promise<SettingsResult>, after?: (r: SettingsResult) => void) {
    startTransition(async () => {
      const r = await action();
      setResults((prev) => ({ ...prev, [key]: r }));
      toast(r.ok ? r.message : r.error);
      after?.(r);
    });
  }

  const form = (key: string, fn: (f: FormData) => Promise<SettingsResult>, after?: (r: SettingsResult, el: HTMLFormElement) => void) =>
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const el = e.currentTarget;
      const f = new FormData(el);
      run(key, () => fn(f), (r) => after?.(r, el));
    };

  function pickTheme(t: Theme) {
    setCurrentTheme(t);
    // Application immédiate ; le serveur enregistre le choix et le cookie qui évite le flash au chargement
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    run("theme", () => setTheme(t));
  }

  async function signOut() {
    await authClient.signOut();
    router.replace("/connexion");
    router.refresh();
  }

  return (
    <div className="settings-grid">
      <section className="card set" aria-labelledby="s-profil">
        <h2 id="s-profil">Profil</h2>
        <form
          onSubmit={form("name", (f) => updateName(String(f.get("name") ?? "")), (r) => r.ok && router.refresh())}
        >
          <div className="field">
            <label htmlFor="set-name">Nom</label>
            <input id="set-name" name="name" defaultValue={name} maxLength={80} required autoComplete="name" />
          </div>
          <button className="btn ghost sm" type="submit" disabled={pending}>
            Enregistrer le nom
          </button>
          <Feedback res={results.name ?? null} />
        </form>
        <form
          onSubmit={form("email", (f) => updateEmail(String(f.get("email") ?? "")), (r) => r.ok && router.refresh())}
        >
          <div className="field">
            <label htmlFor="set-email">Adresse e-mail</label>
            <input id="set-email" name="email" type="email" defaultValue={email} required autoComplete="email" />
          </div>
          <button className="btn ghost sm" type="submit" disabled={pending}>
            Enregistrer l&apos;adresse
          </button>
          <Feedback res={results.email ?? null} />
        </form>
      </section>

      <section className="card set" aria-labelledby="s-securite">
        <h2 id="s-securite">Sécurité</h2>
        <div className="set-actions">
          <h3>Mot de passe</h3>
          <p className="hint">
            Le mot de passe se modifie par un lien envoyé à l&apos;adresse du compte ({email}), valable 1 heure.
          </p>
          <button className="btn sm" type="button" disabled={pending} onClick={() => run("password", sendPasswordLink)}>
            Recevoir un lien de changement de mot de passe
          </button>
          <Feedback res={results.password ?? null} />
        </div>
        <div className="set-actions">
          <h3>Sessions</h3>
          <button className="btn ghost sm" type="button" onClick={signOut}>
            Se déconnecter
          </button>
          {confirmAll ? (
            <div className="confirm" style={{ flexWrap: "wrap" }}>
              <span>Fermer la session sur tous les appareils, y compris celui-ci ?</span>
              <button
                className="btn sm out"
                type="button"
                disabled={pending}
                onClick={() => run("all", signOutEverywhere)}
              >
                Confirmer
              </button>
              <button className="btn sm ghost" type="button" onClick={() => setConfirmAll(false)}>
                Annuler
              </button>
            </div>
          ) : (
            <button className="btn ghost sm" type="button" onClick={() => setConfirmAll(true)}>
              Se déconnecter de tous les appareils
            </button>
          )}
        </div>
      </section>

      <section className="card set" aria-labelledby="s-apparence">
        <h2 id="s-apparence">Apparence</h2>
        <div className="themes" role="radiogroup" aria-label="Thème">
          {THEME_OPTIONS.map((o) => (
            <label key={o.id} className="theme-opt">
              <input
                type="radio"
                name="theme"
                value={o.id}
                checked={currentTheme === o.id}
                onChange={() => pickTheme(o.id)}
              />
              <span>{o.name}</span>
            </label>
          ))}
        </div>
        <p className="hint">Le choix est enregistré pour ce compte et appliqué sur chaque appareil connecté.</p>
      </section>

      <section className="card set" aria-labelledby="s-notifications">
        <h2 id="s-notifications">Notifications</h2>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={weekly}
            onChange={(e) => {
              const on = e.target.checked;
              setWeekly(on);
              run("weekly", () => setWeeklyEmail(on), (r) => !r.ok && setWeekly(!on));
            }}
          />
          <span className="switch-ui" aria-hidden="true" />
          <span>Recevoir le rapport hebdomadaire par e-mail</span>
        </label>
        <p className="hint">
          Chaque dimanche à 20 h, le rapport de la semaine écoulée est envoyé à {email}, avec le rapport complet en PDF.
          Aucun e-mail n&apos;est envoyé si la semaine ne contient aucun mouvement.
        </p>
        <div className="set-actions">
          <button className="btn ghost sm" type="button" disabled={pending} onClick={() => run("test", sendTestReport)}>
            M&apos;envoyer un rapport d&apos;essai maintenant
          </button>
          <Feedback res={results.test ?? null} />
        </div>
      </section>

      <section className="card set" aria-labelledby="s-donnees">
        <h2 id="s-donnees">Données</h2>
        <div className="set-row">
          <div>
            <b>Exporter mes données</b>
            <p className="hint">Fichier JSON contenant toutes les données du compte : lignes, budgets, transactions, personnes, projets.</p>
          </div>
          <a className="btn ghost sm" href="/reglages/export" download>
            Exporter
          </a>
        </div>
        <div className="set-row">
          <div>
            <b>Tout réinitialiser</b>
            <p className="hint">
              Supprime toutes les données (transactions, lignes de budget, budgets figés, personnes, projets, sorties de
              caisse, réglages) comme pour une première utilisation. Seuls l&apos;adresse e-mail et le mot de passe sont
              conservés ; les autres appareils sont déconnectés.
            </p>
          </div>
          {danger !== "reset" && (
            <button className="btn ghost sm danger" type="button" onClick={() => setDanger("reset")}>
              Tout réinitialiser
            </button>
          )}
        </div>
        {danger === "reset" && (
          <DangerConfirm
            id="reset"
            label="Tout réinitialiser"
            pending={pending}
            result={results.reset ?? null}
            onCancel={() => setDanger(null)}
            onConfirm={(word, password) =>
              run("reset", () => resetAccount({ word, password }), (r) => {
                if (!r.ok) return;
                setDanger(null);
                delete document.documentElement.dataset.theme;
                router.replace("/depenses");
                router.refresh();
              })
            }
          />
        )}
      </section>

      <section className="card set" aria-labelledby="s-compte">
        <h2 id="s-compte">Compte</h2>
        <div className="set-row">
          <div>
            <b>Supprimer mon compte</b>
            <p className="hint">Efface définitivement le compte et toutes ses données. Cette action est irréversible.</p>
          </div>
          {danger !== "delete" && (
            <button className="btn ghost sm danger" type="button" onClick={() => setDanger("delete")}>
              Supprimer mon compte
            </button>
          )}
        </div>
        {danger === "delete" && (
          <DangerConfirm
            id="delete"
            label="Supprimer définitivement"
            pending={pending}
            result={results.delete ?? null}
            onCancel={() => setDanger(null)}
            onConfirm={(word, password) =>
              run("delete", () => deleteAccount({ word, password }))
            }
          />
        )}
      </section>

      <section className="card set" aria-labelledby="s-apropos">
        <h2 id="s-apropos">À propos</h2>
        <p className="set-about">
          <b>Mawnytrack</b> · version {version}
        </p>
        <p className="hint">Suivi des finances personnelles en FCFA.</p>
      </section>
    </div>
  );
}

/** Double confirmation dans la page : saisir « RÉINITIALISER » et le mot de passe. */
function DangerConfirm({
  id,
  label,
  pending,
  result,
  onCancel,
  onConfirm,
}: {
  id: string;
  label: string;
  pending: boolean;
  result: SettingsResult | null;
  onCancel: () => void;
  onConfirm: (word: string, password: string) => void;
}) {
  const [word, setWord] = useState("");
  const ready = word.trim().toLocaleUpperCase("fr-FR") === "RÉINITIALISER";
  return (
    <form
      className="danger-box"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(word, String(new FormData(e.currentTarget).get("password") ?? ""));
      }}
    >
      <div className="field">
        <label htmlFor={`${id}-word`}>Pour confirmer, saisissez « RÉINITIALISER »</label>
        <input id={`${id}-word`} value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoCapitalize="characters" required autoFocus />
      </div>
      <div className="field">
        <label htmlFor={`${id}-pwd`}>Mot de passe</label>
        <PasswordInput id={`${id}-pwd`} name="password" autoComplete="current-password" required />
      </div>
      <Feedback res={result && !result.ok ? result : null} />
      <div className="confirm" style={{ flexWrap: "wrap" }}>
        <button className="btn sm out" type="submit" disabled={!ready || pending}>
          {pending ? "Veuillez patienter…" : label}
        </button>
        <button className="btn sm ghost" type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
