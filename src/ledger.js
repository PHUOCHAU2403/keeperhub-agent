// Sổ cái append-only.
//
// Ghi CẢ những chu kỳ agent quyết định KHÔNG làm gì. Một sổ cái chỉ có hành
// động thì không chứng minh được agent biết kiềm chế — mà kiềm chế mới là thứ
// khó, không phải hành động.

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

export function record(entry) {
  const row = { ts: new Date().toISOString(), chain: config.chain.name, ...entry };
  mkdirSync(dirname(config.ledgerPath), { recursive: true });
  appendFileSync(config.ledgerPath, JSON.stringify(row) + "\n");
  return row;
}

export function readLedger() {
  if (!existsSync(config.ledgerPath)) return [];
  return readFileSync(config.ledgerPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

/** Tổng đã chi trong phiên — dùng để chặn khi chạm trần ngân sách. */
export function spentThisSession(since) {
  return readLedger()
    .filter((r) => r.action === "transfer" && r.executed && new Date(r.ts) >= since)
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);
}

export function summary() {
  const rows = readLedger();
  const acted = rows.filter((r) => r.executed);
  return {
    cycles: rows.filter((r) => r.type === "cycle").length,
    decisions: rows.filter((r) => r.action).length,
    executed: acted.length,
    heldBack: rows.filter((r) => r.action && !r.executed).length,
    usdcMoved: acted.reduce((s, r) => s + Number(r.amount || 0), 0),
    txs: acted.filter((r) => r.txHash).map((r) => r.txHash),
  };
}
