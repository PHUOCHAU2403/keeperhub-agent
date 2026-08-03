// Agent — vòng lặp CẢM → QUYẾT → THỰC THI → GHI.
//
// Mọi lệnh ra chain đều đi qua KeeperHub. Mọi quyết định đều vào sổ cái, kể cả
// khi kết luận là "không làm gì" — một sổ cái chỉ có hành động không chứng minh
// được agent biết kiềm chế, mà kiềm chế mới là phần khó.
//
// Phần suy nghĩ nằm ở rules.js (thuần hàm, test được). File này chỉ lo I/O.
//
//   node src/agent.js once     một chu kỳ rồi thoát
//   node src/agent.js loop     chạy liên tục
//   node src/agent.js status   tóm tắt sổ cái

import { config, usdc } from "./config.js";
import * as kh from "./keeperhub.js";
import { decide, guard } from "./rules.js";
import { record, summary, spentThisSession } from "./ledger.js";

const SESSION_START = new Date();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function sense() {
  return { usdc: await kh.usdcBalance(), at: Date.now() };
}

async function execute(intent, cycleNo) {
  // Khoá idempotency gắn với chu kỳ + số tiền: retry mạng KHÔNG chuyển hai lần.
  const key = `sweep-${config.chain.id}-${cycleNo}-${intent.amount}`;
  const started = await kh.transferUsdc({ to: intent.to, amount: intent.amount, idempotencyKey: key });
  const final = started.executionId ? await kh.waitFor(started.executionId) : started;

  return {
    executionId: started.executionId ?? null,
    status: final.status ?? "unknown",
    txHash: final.transactionHash ?? null,
    txLink: final.transactionLink ?? null,
    sponsored: final.result?.sponsored ?? null,
    error: final.error ?? null,
  };
}

export async function cycle(n = 1) {
  const s = await sense();
  log(`cảm: ${usdc(s.usdc)} trên ${config.chain.name}`);
  record({ type: "cycle", cycle: n, usdcBalance: s.usdc, simulate: config.simulate });

  const intent = decide(s);
  if (!intent) { log("quyết: không quy tắc nào khớp"); return; }

  const base = { type: "decision", cycle: n, rule: intent.rule, action: intent.action, reason: intent.reason };

  if (intent.skip) {
    log(`giữ: ${intent.reason}`);
    record({ ...base, executed: false });
    return;
  }

  const blocked = guard(intent, spentThisSession(SESSION_START));
  if (blocked) {
    log(`⛔ chặn: ${blocked}`);
    record({ ...base, amount: intent.amount, executed: false, blocked });
    return;
  }

  log(`quyết: ${intent.reason}`);
  log(`thực thi: ${usdc(intent.amount)} → ${intent.to}${config.simulate ? "   [MÔ PHỎNG]" : ""}`);

  try {
    const r = await execute(intent, n);
    // KeeperHub trả "simulated" cho lượt chạy khô — đó là THÀNH CÔNG, không
    // phải lỗi. Chỉ "completed" mới là đã lên chain.
    const ok = ["completed", "simulated", "success"].includes(r.status) && !r.error;
    const onChain = r.status === "completed" && !config.simulate;
    log(
      !ok ? `❌ ${r.status} ${r.error ?? ""}`
        : onChain ? `✅ ${r.txHash}`
        : `✅ mô phỏng đạt — API nhận lệnh, không phát lên chain`
    );
    record({ ...base, amount: intent.amount, to: intent.to, executed: onChain, simulated: config.simulate, ...r });
  } catch (e) {
    // Lỗi thực thi KHÔNG được tính là đã chi — nếu không, ngân sách phiên sẽ
    // trôi vì những lệnh chưa từng chạm chain.
    log(`❌ lỗi: ${e.message}`);
    record({ ...base, amount: intent.amount, executed: false, error: e.message });
  }
}

const mode = process.argv[2] || "once";

if (mode === "status") {
  console.log(JSON.stringify(summary(), null, 2));
} else if (mode === "loop") {
  log(`agent chạy · ${config.chain.name} · ${config.simulate ? "MÔ PHỎNG" : "THẬT"} · mỗi ${config.intervalMs / 1000}s`);
  let n = 0;
  const tick = async () => { try { await cycle(++n); } catch (e) { log("lỗi chu kỳ:", e.message); } };
  await tick();
  setInterval(tick, config.intervalMs);
} else {
  log(`một chu kỳ · ${config.chain.name} · ${config.simulate ? "MÔ PHỎNG" : "THẬT"}`);
  await cycle(1);
}
