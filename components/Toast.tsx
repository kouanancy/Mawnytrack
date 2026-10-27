"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2800);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div role="status" aria-live="polite">
        {msg && <div className="toast">{msg}</div>}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
