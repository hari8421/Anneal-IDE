import { emptySession, type SessionState } from './session';

export type ChatMode = 'ask' | 'agent' | 'spec';

export interface AskMessage {
  role: 'user' | 'assistant';
  /** Text shown in the transcript. */
  text: string;
  /** Full prompt sent to the model; includes attached file contents for user turns. */
  content?: string;
}

/** One saved conversation. Agent transcripts are replayed from their session state;
 *  Ask messages are plain LLM turns and live only in the browser. */
export interface ChatRecord {
  id: string;
  title: string;
  mode: ChatMode;
  createdAt: number;
  updatedAt: number;
  session: SessionState;
  askMessages: AskMessage[];
}

const STORAGE_KEY = 'anneal.chats.v1';
const MAX_CHATS = 40;

export function newChat(mode: ChatMode = 'agent'): ChatRecord {
  const now = Date.now();
  return {
    id: `chat-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'New conversation',
    mode,
    createdAt: now,
    updatedAt: now,
    session: emptySession(),
    askMessages: [],
  };
}

function revive(raw: unknown): ChatRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<ChatRecord>;
  if (typeof value.id !== 'string' || !value.session || !Array.isArray(value.session.entries)) return null;
  const session: SessionState = {
    ...emptySession(),
    ...value.session,
    streaming: false,
    entries: value.session.entries.map((entry, index) => ({
      ...entry,
      id: index + 1,
      status: entry.status === 'running' ? 'ok' : entry.status,
      awaitingApproval: false,
    })),
  };
  return {
    id: value.id,
    title: typeof value.title === 'string' ? value.title : 'Conversation',
    mode: value.mode === 'ask' || value.mode === 'spec' ? value.mode : 'agent',
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    session,
    askMessages: Array.isArray(value.askMessages)
      ? value.askMessages
          .filter(
            (message): message is AskMessage =>
              Boolean(message) && (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string',
          )
          .map((message) => ({
            ...message,
            ...(typeof message.content === 'string' ? { content: message.content } : {}),
          }))
      : [],
  };
}

export function loadChats(): ChatRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(revive)
      .filter((chat): chat is ChatRecord => chat !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CHATS);
  } catch {
    return [];
  }
}

export function saveChats(chats: ChatRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, MAX_CHATS)));
  } catch {
    // Browser storage can be unavailable; conversations still work for this session.
  }
}

export function chatTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 42) return cleaned || 'New conversation';
  return `${cleaned.slice(0, 42)}…`;
}
