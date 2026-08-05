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
  const withFee = acted.filter((r) => r.feeInToken != null);

  return {
    cycles: rows.filter((r) => r.type === "cycle").length,
    decisions: rows.filter((r) => r.action).length,
    executed: acted.length,
    heldBack: rows.filter((r) => r.action && !r.executed).length,
    moved: acted.reduce((s, r) => s + Number(r.amount || 0), 0),

    // Chi phí vận hành, cùng đơn vị với dòng tiền. Chỉ đo được trên chain thu
    // phí bằng stablecoin (Tempo); nơi khác phí là gas token khác đơn vị, và ở
    // đây được KeeperHub tài trợ nên agent không trả gì cả.
    //
    // `feeUnmeasured` để riêng, không gộp vào 0: "chưa đo được" và "bằng không"
    // là hai chuyện khác nhau, gộp lại là làm bảng cân đối nói dối.
    feesPaid: withFee.reduce((s, r) => s + Number(r.feeInToken), 0),
    feeMeasured: withFee.length,
    feeUnmeasured: acted.length - withFee.length,

    // Bao nhiêu khoản đối soát được bằng chính chain, thay vì bằng sổ của agent.
    memoOnChain: acted.filter((r) => r.memoOnChain).length,

    // Đã đọc lại receipt từ RPC công khai và thấy thành công.
    chainVerified: acted.filter((r) => r.verified).length,

    txs: acted.filter((r) => r.txHash).map((r) => r.txHash),
  };
}
