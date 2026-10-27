const base = { fill: "none", stroke: "currentColor", "aria-hidden": true } as const;

export const IcoTrash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...base}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
);
export const IcoBack = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2.2" {...base}><path d="m15 18-6-6 6-6" /></svg>
);
export const IcoChev = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2.2" {...base}><path d="m9 18 6-6-6-6" /></svg>
);
export const IcoWarn = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" {...base}><path d="M12 3 2 20h20L12 3zM12 10v4M12 17.5v.01" /></svg>
);
export const IcoMenu = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" {...base}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IcoCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2.5" {...base}><path d="m5 12 5 5L20 7" /></svg>
);
export const IcoFilter = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" {...base}><path d="M3 5h18M6 12h12M10 19h4" /></svg>
);
export const IcoDown = () => (
  <svg className="cv" width="16" height="16" viewBox="0 0 24 24" strokeWidth="2.2" {...base}><path d="m6 9 6 6 6-6" /></svg>
);
export const IcoPrint = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2" />
    <rect x="6" y="14" width="12" height="7" rx="1" />
  </svg>
);
