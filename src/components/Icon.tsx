import type { ReactNode } from 'react';

export type IconName =
  | 'logo' | 'files' | 'search' | 'specs' | 'steering' | 'hooks' | 'undo' | 'runs' | 'models'
  | 'mcp' | 'debug' | 'settings' | 'chat' | 'terminal' | 'output' | 'plus' | 'save' | 'close'
  | 'chevronDown' | 'chevronRight' | 'folder' | 'folderOpen' | 'file' | 'check' | 'play' | 'stop'
  | 'send' | 'sparkles' | 'command' | 'panelLeft' | 'panelRight' | 'panelBottom' | 'refresh'
  | 'trash' | 'edit' | 'arrowRight' | 'more' | 'warning' | 'info' | 'clock' | 'branch' | 'zap'
  | 'shield' | 'database' | 'book' | 'webhook' | 'link' | 'external' | 'copy' | 'pin' | 'loader'
  | 'listCheck' | 'cpu' | 'keyboard' | 'folderPlus' | 'filePlus' | 'filter' | 'hash' | 'code'
  | 'bot' | 'user' | 'paperclip' | 'arrowUp' | 'arrowDown' | 'lightbulb' | 'history' | 'layers';

const PATHS: Record<IconName, ReactNode> = {
  logo: <><path d="M12 2 3.5 7v10L12 22l8.5-5V7L12 2Z" /><path d="m12 7-4.5 2.6v4.8L12 17l4.5-2.6V9.6L12 7Z" /></>,
  files: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  specs: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" /></>,
  steering: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /><path d="M9 7h7M9 11h5" /></>,
  hooks: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" /></>,
  undo: <><path d="M3 7v6h6" /><path d="M3.5 13a9 9 0 1 0 2.6-6.4L3 9" /></>,
  runs: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
  models: <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></>,
  mcp: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8h8v8H8zM12 1v2M12 21v2M1 12h2M21 12h2" /></>,
  debug: <><path d="M12 22a7 7 0 0 0 7-7v-2H5v2a7 7 0 0 0 7 7Z" /><path d="M12 22v-3M5 10V7a7 7 0 0 1 14 0v3" /><circle cx="9" cy="14" r="1" /><circle cx="15" cy="14" r="1" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4h-.2a1.7 1.7 0 0 0-1.6 1Z" /></>,
  chat: <><path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.3-4.3A8 8 0 1 1 21 12Z" /><path d="M8 11h8M8 15h5" /></>,
  terminal: <><rect x="2" y="3" width="20" height="18" rx="2" /><path d="m6 9 3 3-3 3M12 15h6" /></>,
  output: <><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M6 7h.01M10 7h.01M14 7h6M6 12h12M6 17h8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  folder: <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />,
  folderOpen: <><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2" /><path d="M3 9h18l-2 10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></>,
  check: <path d="m4 12 5 5L20 6" />,
  play: <path d="m7 4 13 8-13 8V4Z" />,
  stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
  send: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>,
  sparkles: <><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" /><path d="M19 16.5 20 19l2.5 1L20 21l-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" /></>,
  command: <><path d="M18 8a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V5a3 3 0 1 0-3 3h12Z" /></>,
  panelLeft: <><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M8 3v18" /></>,
  panelRight: <><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M16 3v18" /></>,
  panelBottom: <><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M2 15h20" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-.5 4" /><path d="M20 4v7h-7" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6" /><path d="M10 10v7M14 10v7" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></>,
  arrowRight: <path d="M4 12h16m-6-6 6 6-6 6" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  warning: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="7" r="2" /><path d="M6 7v10M18 9a6 6 0 0 1-6 6H6" /></>,
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
  webhook: <><path d="M18 16.5a3 3 0 1 0-2-5.2" /><path d="M6 16.5a3 3 0 1 1 2-5.2" /><path d="M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" /><path d="m7 14 3 5a3 3 0 0 0 5 1l1-1" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" /></>,
  external: <><path d="M14 3h7v7M21 3l-9 9" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  pin: <><path d="m12 17 0 5M8 3h8l-1 6 3 3v2H6v-2l3-3-1-6Z" /></>,
  loader: <><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></>,
  listCheck: <><path d="m3 6 2 2 3-3M3 13l2 2 3-3M3 20l2 2 3-3M11 7h10M11 14h10M11 21h10" /></>,
  cpu: <><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" /></>,
  keyboard: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8" /></>,
  folderPlus: <><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" /><path d="M12 11v6M9 14h6" /></>,
  filePlus: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M12 12v6M9 15h6" /></>,
  filter: <path d="M3 4h18l-7 8v7l-4 2v-9L3 4Z" />,
  hash: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  code: <path d="m8 8-5 4 5 4m8-8 5 4-5 4m-3-12-2 16" />,
  bot: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4M9 3h6M9 14h.01M15 14h.01M9 17h6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  paperclip: <path d="M20 11a5 5 0 0 0-7-7L7 10a3.5 3.5 0 0 0 5 5l7-7a2 2 0 0 0-3-3l-7 7a.5.5 0 0 0 .7.7l7-7" />,
  arrowUp: <path d="M12 20V4m-6 6 6-6 6 6" />,
  arrowDown: <path d="M12 4v16m-6-6 6 6 6-6" />,
  lightbulb: <><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></>,
};

export function Icon({ name, size = 16, className = '', strokeWidth = 1.7 }: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
