export const CHAT_PHRASES = {
  hello: "Hola", good_luck: "Buena suerte", thanks: "Gracias", well_played: "Bien jugado",
  congratulations: "Enhorabuena", good_game: "Buena partida", goodbye: "Hasta luego", have_fun: "Vamos a divertirnos",
} as const;
export const CHAT_EMOJIS = { wave: "👋", smile: "😊", applause: "👏", celebration: "🎉", hands: "🙌", handshake: "🤝" } as const;
export type ChatContent =
  | { readonly kind: "PHRASE"; readonly id: keyof typeof CHAT_PHRASES }
  | { readonly kind: "EMOJI"; readonly id: keyof typeof CHAT_EMOJIS }
  | { readonly kind: "TEXT"; readonly text: string };
export type ChatChannel =
  | { readonly type: "LOBBY" }
  | { readonly type: "PRIVATE" | "COMPETITION"; readonly code: string }
  | { readonly type: "QUICK"; readonly matchId: string };
export interface ChatMessage {
  readonly messageId: string; readonly authorId: string; readonly playerId: string | null;
  readonly authorName: string; readonly at: number; readonly content: ChatContent; readonly text: string;
}
export interface ChatView {
  readonly messages: readonly ChatMessage[]; readonly mutedIdentityIds: readonly string[];
  readonly canSend: boolean; readonly policy: "TEXT" | "QUICK" | "PHRASES";
  readonly serverNow: number; readonly viewerId: string;
}
export function chatPath(channel: ChatChannel): string {
  if (channel.type === "LOBBY") return "/api/chat/lobby";
  return `/api/chat/${channel.type.toLowerCase()}/${encodeURIComponent(channel.type === "QUICK" ? channel.matchId : channel.code)}`;
}
