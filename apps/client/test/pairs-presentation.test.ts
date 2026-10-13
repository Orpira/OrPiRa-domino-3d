import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startMatch } from "../../../packages/rules/src/index.ts";
import { dealFor, PLAYERS } from "../../../packages/rules/test/helpers.ts";
import { championTeamText, openerText, pairsRoundText, teamStandings } from "../src/pairs-presentation.ts";

const names = { P0: "Tú", P1: "Luna", P2: "Bruno", P3: "Vera" };
const base = { handPipTotals: { P0: 0, P1: 10, P2: 5, P3: 8 }, tiedPlayerIds: [] };

describe("textos del modo parejas", () => {
  it("marcadores por pareja, con la del jugador local primero", () => {
    const state = startMatch("m", PLAYERS, dealFor(1), { mode: "PAIRS" }).state;
    const teams = teamStandings(state, names);
    assert.deepEqual(teams.map((team) => team.label), ["Tú y Bruno", "Luna y Vera"]);
    assert.equal(teams.filter((team) => team.active).length, 1);
  });
  it("online, la pareja del espectador va primero aunque no ocupe el asiento 0", () => {
    const state = startMatch("m", PLAYERS, dealFor(1), { mode: "PAIRS" }).state; const online = { P0: "Ana", P1: "Beto", P2: "Cora", P3: "Dani" };
    assert.deepEqual(teamStandings(state, online, "P3").map((team) => team.label), ["Beto y Dani", "Ana y Cora"]);
    assert.deepEqual(teamStandings(state, online, "P2").map((team) => team.label), ["Ana y Cora", "Beto y Dani"]);
  });
  it("dominada, tranque y empate", () => {
    const domino = pairsRoundText({ ...base, reason: "DOMINO", winnerId: "P0", winningTeam: ["P0", "P2"], scoreDeltas: { P0: 23, P2: 23, P1: 0, P3: 0 } }, names);
    assert.equal(domino.headline, "Tú y Bruno ganan la mano"); assert.match(domino.detail, /^Dominaste tú: \+23 puntos/);
    const rival = pairsRoundText({ ...base, reason: "DOMINO", winnerId: "P3", winningTeam: ["P1", "P3"], scoreDeltas: { P1: 9, P3: 9, P0: 0, P2: 0 } }, names);
    assert.match(rival.detail, /^Dominó Vera: \+9/);
    const blocked = pairsRoundText({ ...base, reason: "BLOCKED", winnerId: "P1", winningTeam: ["P1", "P3"], scoreDeltas: { P1: 40, P3: 40, P0: 0, P2: 0 } }, names);
    assert.equal(blocked.headline, "Luna y Vera ganan el tranque");
    const tie = pairsRoundText({ ...base, reason: "BLOCKED", winnerId: null, tiedPlayerIds: ["P0", "P1", "P2", "P3"], scoreDeltas: { P0: 0, P1: 0, P2: 0, P3: 0 } }, names);
    assert.equal(tie.headline, "Tranque empatado");
  });
  it("quién sale y quién gana la partida", () => {
    assert.equal(openerText("Tú"), "Sales tú"); assert.equal(openerText("Luna"), "Sale Luna");
    assert.deepEqual(championTeamText({ championId: "P2", championTeam: ["P0", "P2"], finalScores: { P0: 212, P2: 212, P1: 90, P3: 90 } }, names), { label: "Tú y Bruno", score: 212 });
  });
});
