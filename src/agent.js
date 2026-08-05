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

import { config, money } from "./config.js";
import * as kh from "./keeperhub.js";
import { readReceipt } from "./receipt.js";
import { decide, guard } from "./rules.js";
import { record, summary, spentThisSession } from "./ledger.js";

const SESSION_START = new Date();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function sense() {
  return { balance: await kh.balance(), at: Date.now() };
}

async function execute(intent, cycleNo) {
  // Khoá idempotency: retry mạng KHÔNG được chuyển tiền hai lần.
  //
  // Dựng từ tham chiếu đối soát chứ không từ số chu kỳ. Số chu kỳ đếm lại từ 1
  // mỗi lần tiến trình khởi động, nên `sweep-<chain>-1-<số tiền>` sẽ đụng nhau
  // giữa hai phiên bất cứ khi nào số tiền trùng — và khi đụng thì KeeperHub từ
  // chối một khoản quét lẽ ra hợp lệ. Tham chiếu có sẵn ngày trong đó, nên khoá
  // ổn định trong cùng ngày (retry gộp đúng) và khác nhau qua ngày mới.
  const ref = intent.memo ?? `c${cycleNo}`;
  const key = `sweep-${config.chain.id}-${ref}-${intent.amount}`;

  // Cùng một ý định, hai đường thực thi. Chain nào chở được tham chiếu thì chở;
  // chain nào không thì tham chiếu chỉ nằm trong sổ cái nội bộ. Sổ cái ghi rõ
  // nó nằm ở đâu, vì "đối soát được bằng chain" và "đối soát được bằng sổ của
  // chính agent" là hai mức tin cậy khác hẳn nhau.
  const onChainMemo = Boolean(config.chain.memo && intent.memo);
  const started = onChainMemo
    ? await kh.transferWithMemo({ to: intent.to, amount: intent.amount, memo: intent.memo, idempotencyKey: key })
    : await kh.transfer({ to: intent.to, amount: intent.amount, idempotencyKey: key });

  const final = started.executionId ? await kh.waitFor(started.executionId) : started;

  return {
    executionId: started.executionId ?? null,
    status: final.status ?? "unknown",
    txHash: final.transactionHash ?? null,
    txLink: final.transactionLink ?? null,
    sponsored: final.result?.sponsored ?? null,
    error: final.error ?? null,
    memo: intent.memo ?? null,
    memoOnChain: onChainMemo,
  };
}

/**
 * Đối chiếu lại với chain sau khi API báo xong.
 *
 * Không phải nghi ngờ KeeperHub — mà vì bên thực thi không nên là bên duy nhất
 * xác nhận kết quả của chính mình. Đây cũng là chỗ agent đọc được PHÍ đã trả:
 * trên Tempo phí thu bằng chính stablecoin vừa chuyển, nên nó khép luôn được
 * chi phí vào bảng cân đối mà không cần quy đổi.
 */
async function confirm(txHash) {
  try {
    const r = await readReceipt(txHash);
    if (!r) return { verified: false, why: "chưa có receipt" };
    return {
      verified: r.success,
      onChainFrom: r.from,
      blockNumber: r.blockNumber,
      feeInToken: r.feeInToken,
      memoOnChainValue: r.memo,
    };
  } catch (e) {
    // Không đọc được chain thì nói là không đọc được. Tuyệt đối không im lặng
    // coi như đã xác minh.
    return { verified: false, why: e.message };
  }
}

export async function cycle(n = 1) {
  const s = await sense();
  log(`cảm: ${money(s.balance)} trên ${config.chain.name}`);
  record({ type: "cycle", cycle: n, balance: s.balance, simulate: config.simulate });

  const intent = decide({ ...s, cycle: n });
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
  log(`thực thi: ${money(intent.amount)} → ${intent.to}${config.simulate ? "   [MÔ PHỎNG]" : ""}`);
  if (config.chain.memo) log(`         memo: ${intent.memo}`);

  try {
    const r = await execute(intent, n);
    // KeeperHub trả "simulated" cho lượt chạy khô — đó là THÀNH CÔNG, không
    // phải lỗi. Chỉ "completed" mới là đã lên chain.
    const ok = ["completed", "simulated", "success"].includes(r.status) && !r.error;
    const onChain = r.status === "completed" && !config.simulate;

    const proof = onChain && r.txHash ? await confirm(r.txHash) : {};

    log(
      !ok ? `❌ ${r.status} ${r.error ?? ""}`
        : onChain ? `✅ ${r.txHash}`
        : `✅ mô phỏng đạt — API nhận lệnh, không phát lên chain`
    );
    if (onChain) {
      if (config.chain.explorer) log(`   ${config.chain.explorer}${r.txHash}`);
      log(`   chain xác nhận: ${proof.verified ? "có" : `KHÔNG (${proof.why ?? "?"})`}`);
      if (proof.feeInToken != null) log(`   phí đã trả:     ${money(proof.feeInToken)}`);
      if (proof.memoOnChainValue) log(`   memo trên chain: ${proof.memoOnChainValue}`);
    }

    record({ ...base, amount: intent.amount, to: intent.to, executed: onChain, simulated: config.simulate, ...r, ...proof });
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
