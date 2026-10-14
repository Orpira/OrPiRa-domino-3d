import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CHAT_EMOJIS, CHAT_PHRASES, type ChatChannel, type ChatContent, type ChatMessage, type ChatView } from "../../../packages/protocol/src/chat.ts";

export type ChatPhase = "WAITING" | "ROUND_ACTIVE" | "ROUND_ENDED" | "MATCH_ENDED";
export interface TableChatContext {
  readonly matchId: string; readonly identityId: string; readonly playerId: string; readonly displayName: string;
  readonly phase: () => ChatPhase; readonly closed: () => boolean;
}
export interface ChatAccess {
  readonly identityId: string; readonly displayName: string; readonly mutedIdentityIds: readonly string[];
  readonly setMuted: (ids: readonly string[]) => Promise<void>;
  readonly canSend: boolean; readonly policy: ChatView["policy"]; readonly table?: TableChatContext;
}
export type ChatResolver = (channel: ChatChannel, token: string) => ChatAccess;
interface Report {
  readonly messageId: string; readonly text: string; readonly author: { readonly identityId: string; readonly name: string };
  readonly reporterId: string; readonly at: number;
}
interface History { messages: ChatMessage[]; readonly table: TableChatContext; ended: boolean }

// Normalización conserva los offsets originales para enmascarar también tildes, leet y letras separadas.
const BAD_WORDS = ["mierda", "puta", "puto", "putas", "putos", "joder", "jodido", "jodida", "coño", "cojones", "cabron", "cabrona",
  "gilipollas", "pendejo", "pendeja", "marica", "maricon", "maricona", "gonorrea", "gonorreico", "hijueputa", "hijuepucha",
  "hijoeputa", "hijueputas", "hijodeputa", "malparido", "malparida", "malparidos", "carechimba", "careverga", "verga",
  // Variantes y abreviaturas colombianas. «Chimba» sola no se filtra: en Colombia suele ser elogio («¡qué chimba!»).
  "hp", "hpta", "jueputa", "juepucha", "gonorreas", "pirobo", "piroba", "guevon", "guevona", "huevon", "huevona", "webon", "mamaguevo", "mamahuevo",
  "malnacido", "malnacida", "culicagado", "culo", "perra", "zorra", "chingada", "pinche", "culero", "mamon", "comemierda", "lameculos"];
export const HALL_HISTORY = 50; export const TABLE_HISTORY = 100;
const LEET: Readonly<Record<string, string>> = { "0": "o", "1": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t" };
export function maskProfanity(text: string): string {
  let normalized = ""; const offsets: { start: number; end: number }[] = [];
  let offset = 0;
  for (const char of text) {
    const letters = (LEET[char] ?? char).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (const letter of letters) { normalized += letter; offsets.push({ start: offset, end: offset + char.length }); }
    offset += char.length;
  }
  const pattern = new RegExp(`(?<![a-z])(?:${BAD_WORDS.sort((a, b) => b.length - a.length).map((word) => [...word].map((letter) => `${letter}+`).join("[\\s._*\\-]*")).join("|")})(?:s)?(?![a-z])`, "g");
  const ranges = [...normalized.matchAll(pattern)].map((match) => ({ start: offsets[match.index]!.start, end: offsets[match.index + match[0].length - 1]!.end }));
  return [...text].map((char, index, chars) => {
    // Mensajes cortos (200 caracteres): el cálculo mantiene intactos los emojis ajenos al filtro.
    const start = chars.slice(0, index).join("").length;
    return ranges.some((range) => start >= range.start && start < range.end) && !/\s/u.test(char) ? "*" : char;
  }).join("");
}
function contentOf(input: unknown): { content: ChatContent; text: string } {
  if (!input || typeof input !== "object") throw new Error("CHAT_INVALID_CONTENT");
  const value = input as Record<string, unknown>;
  if (value.kind === "PHRASE" && typeof value.id === "string" && Object.hasOwn(CHAT_PHRASES, value.id)) {
    const id = value.id as keyof typeof CHAT_PHRASES; return { content: { kind: "PHRASE", id }, text: CHAT_PHRASES[id] };
  }
  if (value.kind === "EMOJI" && typeof value.id === "string" && Object.hasOwn(CHAT_EMOJIS, value.id)) {
    const id = value.id as keyof typeof CHAT_EMOJIS; return { content: { kind: "EMOJI", id }, text: CHAT_EMOJIS[id] };
  }
  if (value.kind !== "TEXT" || typeof value.text !== "string" || !value.text.trim() || [...value.text].length > 200) throw new Error("CHAT_INVALID_CONTENT");
  const text = maskProfanity(value.text.trim()); return { content: { kind: "TEXT", text }, text };
}

export class ChatManager {
  private readonly lobby: ChatMessage[] = [];
  private readonly tables = new Map<string, History>();
  private readonly sent = new Map<string, number[]>();
  private readonly reports: Report[] = [];
  private queue: Promise<void> = Promise.resolve();
  private readonly reportPath: string; private readonly resolve: ChatResolver; private readonly now: () => number;
  private constructor(reportPath: string, resolve: ChatResolver, now: () => number) { this.reportPath = reportPath; this.resolve = resolve; this.now = now; }
  static async open(reportPath: string, resolve: ChatResolver, now: () => number = Date.now) {
    const manager = new ChatManager(reportPath, resolve, now);
    try { manager.reports.push(...JSON.parse(await readFile(reportPath, "utf8")) as Report[]); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return manager;
  }
  prune() {
    for (const [id, history] of this.tables) {
      if (history.table.closed()) { this.tables.delete(id); continue; }
      if (!history.ended && history.table.phase() === "MATCH_ENDED") { history.messages = []; history.ended = true; }
    }
    const now = this.now();
    for (const [id, timestamps] of this.sent) if (!timestamps.some((at) => now - at < 60_000)) this.sent.delete(id);
  }
  view(channel: ChatChannel, token: string): ChatView {
    const access = this.resolve(channel, token); this.prune(); const messages = this.history(access);
    return { messages: messages.filter((message) => !access.mutedIdentityIds.includes(message.authorId)),
      mutedIdentityIds: access.mutedIdentityIds, canSend: access.canSend, policy: access.policy, serverNow: this.now(), viewerId: access.identityId };
  }
  send(channel: ChatChannel, token: string, input: unknown): ChatMessage {
    const access = this.resolve(channel, token);
    if (!access.canSend) throw new Error("CHAT_FINISHED_MATCH_REQUIRED");
    const { content, text } = contentOf(input);
    if (access.policy === "PHRASES" && content.kind !== "PHRASE") throw new Error("CHAT_PHRASES_ONLY");
    if (access.policy === "QUICK" && content.kind === "TEXT") throw new Error("CHAT_QUICK_ONLY");
    const now = this.now(); const timestamps = (this.sent.get(access.identityId) ?? []).filter((at) => now - at < 60_000);
    if (timestamps.length >= 10 || (timestamps.length > 0 && now - timestamps.at(-1)! < 2_000)) throw new Error("CHAT_RATE_LIMITED");
    this.prune(); const messages = this.history(access);
    const message: ChatMessage = { messageId: randomUUID(), authorId: access.identityId, playerId: access.table?.playerId ?? null,
      authorName: access.displayName, at: now, content, text };
    timestamps.push(now); this.sent.set(access.identityId, timestamps); messages.push(message);
    // Vestíbulo: últimos 50. Mesa: tope de 100 en memoria (la partida dura poco y el historial se descarta al terminar).
    const keep = access.table ? TABLE_HISTORY : HALL_HISTORY; if (messages.length > keep) messages.splice(0, messages.length - keep);
    return message;
  }
  mute(channel: ChatChannel, token: string, input: unknown): Promise<void> {
    return this.serial(async () => {
      const access = this.resolve(channel, token);
      if (!input || typeof input !== "object") throw new Error("CHAT_INVALID_MUTE");
      const { authorId, muted } = input as Record<string, unknown>;
      if (typeof authorId !== "string" || typeof muted !== "boolean" || authorId === access.identityId) throw new Error("CHAT_INVALID_MUTE");
      if (!access.mutedIdentityIds.includes(authorId) && !this.history(access).some((message) => message.authorId === authorId)) throw new Error("CHAT_MESSAGE_NOT_FOUND");
      await access.setMuted(muted ? [...new Set([...access.mutedIdentityIds, authorId])] : access.mutedIdentityIds.filter((id) => id !== authorId));
    });
  }
  report(channel: ChatChannel, token: string, input: unknown): Promise<void> {
    return this.serial(async () => {
      const access = this.resolve(channel, token); this.prune();
      const id = input && typeof input === "object" ? (input as Record<string, unknown>).messageId : null;
      const message = this.history(access).find((entry) => entry.messageId === id && !access.mutedIdentityIds.includes(entry.authorId));
      if (!message) throw new Error("CHAT_MESSAGE_NOT_FOUND");
      if (this.reports.some((entry) => entry.messageId === id && entry.reporterId === access.identityId)) return;
      const report: Report = { messageId: message.messageId, text: message.text, author: { identityId: message.authorId, name: message.authorName }, reporterId: access.identityId, at: this.now() };
      const next = [...this.reports, report];
      await mkdir(dirname(this.reportPath), { recursive: true }); const temporary = `${this.reportPath}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(next), { encoding: "utf8", mode: 0o600 }); await rename(temporary, this.reportPath);
      this.reports.push(report);
    });
  }
  private history(access: ChatAccess): ChatMessage[] {
    if (!access.table) return this.lobby;
    const table = access.table; if (table.closed()) throw new Error("CHAT_TABLE_CLOSED");
    let history = this.tables.get(table.matchId);
    if (!history) { history = { messages: [], table, ended: table.phase() === "MATCH_ENDED" }; this.tables.set(table.matchId, history); }
    return history.messages;
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation); this.queue = result.then(() => {}, () => {}); return result;
  }
}
