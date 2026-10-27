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
export const IcoEye = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IcoEyeOff = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.9 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  </svg>
);
export const IcoSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
export const IcoLogout = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);
