// Kiểm chứng phần quyết định — không mạng, không ví, không API key.
//
//   node --test test/
//
// Mọi thứ liên quan tới tiền phải kiểm chứng được ngoại tuyến. Nếu chỉ biết
// agent hành xử đúng khi đã gọi API thật thì đã quá muộn để biết.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.CHAIN = "base-sepolia";
process.env.SWEEP_FLOOR = "5";
process.env.SWEEP_MIN = "1";
process.env.MAX_PER_ACTION = "50";
process.env.SESSION_BUDGET = "200";
process.env.TREASURY = "0x000000000000000000000000000000000000dEaD";

const { decide, guard } = await import("../src/rules.js");
const { decodeMemo } = await import("../src/memo.js");

test("below the working-capital floor it does nothing", () => {
  const i = decide({ balance: 3 });
  assert.equal(i.skip, true);
  assert.match(i.reason, /Giữ nguyên/);
});

test("a surplus under the minimum still does nothing", () => {
  // 5.5 - 5 = 0.5 dư, dưới mức tối thiểu 1 → không phát giao dịch cho vài xu
  assert.equal(decide({ balance: 5.5 }).skip, true);
});

test("exactly at the threshold it sweeps", () => {
  const i = decide({ balance: 6 });
  assert.equal(i.skip, undefined);
  assert.equal(i.amount, 1);
  assert.equal(i.rule, "sweepSurplus");
});

test("sweeps only the surplus, keeping working capital", () => {
  assert.equal(decide({ balance: 30 }).amount, 25);
});

test("a zero balance produces no negative intent", () => {
  const i = decide({ balance: 0 });
  assert.equal(i.skip, true);
});

test("the guard passes a valid action", () => {
  assert.equal(guard({ to: "0x000000000000000000000000000000000000dEaD", amount: 10 }, 0), null);
});

test("the guard blocks anything over the per-action cap", () => {
  const b = guard({ to: "0x000000000000000000000000000000000000dEaD", amount: 51 }, 0);
  assert.match(b, /trần một lệnh/);
});

test("the guard blocks anything over the session budget", () => {
  const b = guard({ to: "0x000000000000000000000000000000000000dEaD", amount: 10 }, 195);
  assert.match(b, /ngân sách phiên/);
});

test("the guard blocks a malformed recipient", () => {
  assert.match(guard({ to: "0xnothex", amount: 1 }, 0), /địa chỉ/);
  assert.match(guard({ to: "", amount: 1 }, 0), /địa chỉ/);
});

test("the guard blocks a non-positive amount", () => {
  assert.match(guard({ to: "0x000000000000000000000000000000000000dEaD", amount: 0 }, 0), /không dương/);
  assert.match(guard({ to: "0x000000000000000000000000000000000000dEaD", amount: -5 }, 0), /không dương/);
});

test("a large balance is stopped by the guard, not skipped by the rule — the separation matters", () => {
  // Quy tắc muốn quét 995; guard mới là thứ chặn lại. Đúng thứ tự trách nhiệm.
  const i = decide({ balance: 1000 });
  assert.equal(i.amount, 995);
  assert.match(guard(i, 0), /trần một lệnh/);
});

// --- tham chiếu đối soát ------------------------------------------------

test("every sweep carries a reference, even on a chain that cannot put it on chain", () => {
  // Chain đang test là Base Sepolia (memo: false). Quy tắc VẪN phải sinh memo —
  // quyết định thì độc lập với chain, chỉ khâu thực thi mới phụ thuộc.
  const i = decide({ balance: 30, cycle: 7 });
  assert.equal(i.memo, "SWEEP-0007-" + new Date().toISOString().slice(0, 10).replace(/-/g, ""));
});

test("the reference fits in 32 bytes even at absurd cycle numbers", () => {
  const i = decide({ balance: 30, cycle: 999999999 });
  assert.ok(new TextEncoder().encode(i.memo).length <= 32, `memo ${i.memo} quá dài`);
});

test("a missing cycle number still yields a valid memo, never the string 'undefined'", () => {
  const i = decide({ balance: 30 });
  assert.match(i.memo, /^SWEEP-0000-\d{8}$/);
});

test("an intent's memo survives encode and decode intact", async () => {
  const { encodeMemo } = await import("../src/memo.js");
  const i = decide({ balance: 30, cycle: 42 });
  assert.equal(decodeMemo(encodeMemo(i.memo)), i.memo);
});
