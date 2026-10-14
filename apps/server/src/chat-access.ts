import type { ChatView } from "../../../packages/protocol/src/chat.ts";
import type { ChatAccess, ChatResolver, TableChatContext } from "./chat.ts";
import type { CompetitionManager } from "./competition.ts";
import type { LobbyManager } from "./lobby.ts";
import type { QuickPlayManager } from "./quick-play.ts";

export function chatResolver(identities: CompetitionManager, lobbies: LobbyManager, quick: QuickPlayManager): ChatResolver {
  return (channel, token) => {
    let table: TableChatContext | undefined;
    if (channel.type === "PRIVATE") table = lobbies.tableChat(channel.code, token);
    if (channel.type === "COMPETITION") table = identities.tableChat(channel.code, token);
    if (channel.type === "QUICK") table = quick.tableChat(channel.matchId, token);
    const identity = table ?? identities.identify(token); if (!identity) throw new Error("UNAUTHENTICATED");
    const id = identity.identityId;
    let policy: ChatView["policy"] = "TEXT";
    if (channel.type === "COMPETITION" || identities.chatCompetitionOf(id)) policy = "PHRASES";
    else if (table?.phase() === "ROUND_ACTIVE" || lobbies.chatHandActive(id) || quick.chatHandActive(id)) policy = "QUICK";
    const guest = channel.type === "PRIVATE" && id.startsWith("guest-");
    const access: ChatAccess = { identityId: id, displayName: identity.displayName, policy,
      canSend: channel.type !== "LOBBY" || identities.hasFinishedMatch(id) || lobbies.hasFinishedMatch(id) || quick.hasFinishedMatch(id),
      mutedIdentityIds: guest ? lobbies.chatMuted(channel.code, token) : identities.chatMuted(id),
      setMuted: (ids) => guest ? lobbies.setChatMuted(channel.code, token, ids) : identities.setChatMuted(id, ids),
      ...(table ? { table } : {}) };
    return access;
  };
}
