"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

/** Action proposée dans la notification (ex. « Annuler » pendant quelques secondes). */
type ToastOptions = { action?: { label: string; onClick: () => void }; duration?: number };
type Toast = (msg: string, options?: ToastOptions) => void;

const ToastContext = createContext<Toast>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ msg: string; action?: ToastOptions["action"] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback<Toast>((msg, options) => {
    setState({ msg, action: options?.action });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState(null), options?.duration ?? 2800);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div role="status" aria-live="polite">
        {state && (
          <div className="toast">
            <span>{state.msg}</span>
            {state.action && (
              <button
                type="button"
                className="toast-act"
                onClick={() => {
                  clearTimeout(timer.current);
                  setState(null);
                  state.action!.onClick();
                }}
              >
                {state.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
