import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MatchStore, RoomSnapshot } from "./authoritative-room.ts";

export class JsonFileMatchStore implements MatchStore {
  private readonly directory: string;
  constructor(directory: string) { this.directory = directory; }
  private path(matchId: string) { return join(this.directory, `${encodeURIComponent(matchId)}.json`); }
  async load(matchId: string): Promise<RoomSnapshot | null> {
    try { return JSON.parse(await readFile(this.path(matchId), "utf8")) as RoomSnapshot; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  async save(matchId: string, snapshot: RoomSnapshot): Promise<void> {
    await mkdir(this.directory, { recursive: true }); const target = this.path(matchId); const temporary = `${target}.tmp`;
    await writeFile(temporary, JSON.stringify(snapshot), { encoding: "utf8", mode: 0o600 }); await rename(temporary, target);
  }
}
