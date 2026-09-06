import fs from "fs";
import path from "path";
import { PaperFill } from "../types";

const DATA_DIR = path.join(process.cwd(), "data");
const JOURNAL = path.join(DATA_DIR, "trade-journal.jsonl");

export function appendTradeJournal(fill: PaperFill) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(JOURNAL, `${JSON.stringify(fill)}\n`);
  } catch (err) {
    console.error("trade journal write failed", err);
  }
}

export function readTradeJournal(opts?: {
  botId?: string;
  limit?: number;
}): PaperFill[] {
  if (!fs.existsSync(JOURNAL)) return [];
  const limit = opts?.limit ?? 500;
  const lines = fs.readFileSync(JOURNAL, "utf8").split("\n").filter(Boolean);
  const out: PaperFill[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
    try {
      const row = JSON.parse(lines[i]) as PaperFill;
      if (opts?.botId && row.botId !== opts.botId) continue;
      out.push(row);
    } catch {
      // skip
    }
  }
  return out;
}
