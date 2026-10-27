"use client";

import { useState } from "react";
import { IcoEye, IcoEyeOff } from "@/components/Icons";

/** Champ mot de passe avec bouton « œil » pour afficher ou masquer la saisie. */
export function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="pwd">
      <input {...props} type={visible ? "text" : "password"} autoCapitalize="none" spellCheck={false} />
      <button
        type="button"
        className="pwd-eye"
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        aria-pressed={visible}
        aria-controls={props.id}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <IcoEyeOff /> : <IcoEye />}
      </button>
    </div>
  );
}
