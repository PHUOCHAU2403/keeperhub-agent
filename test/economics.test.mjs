// Đơn vị kinh tế — kiểm chứng ngoại tuyến, không sổ cái thật, không mạng.
//
// Đây là phần quyết định agent có bán hay không, nên nó phải chứng minh được
// mà không cần một giao dịch nào. Cùng lý do với rules.js: tới lúc học được
// hành vi từ một lượt bán thật thì tiền đã đổi chủ rồi.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.CHAIN = "tempo-moderato";
process.env.SIGNAL_PRICE = "0.01";
process.env.MIN_MARGIN = "0.5";
process.env.MAX_PRICE = "0.05";

const { unitEconomics, quote } = await import("../src/economics.js");

const CHAIN = "Tempo Moderato";

const sale = (amount, cost) => ({
  chain: CHAIN,
  type: "revenue",
  status: "settled",
  amountUsdc: amount,
  ...(cost === undefined ? {} : { settlementCost: cost }),
});

const sweep = (fee) => ({
  chain: CHAIN,
  type: "decision",
  action: "transfer",
  executed: true,
  amount: 1,
  ...(fee === undefined ? {} : { feeInToken: fee }),
});

// --- đọc sổ ------------------------------------------------------------

test("an empty ledger invents no numbers", () => {
  const e = unitEconomics([]);
  assert.equal(e.calls, 0);
  assert.equal(e.revenue, 0);
  assert.equal(e.avgCostPerCall, null);
});

test("sums revenue and cost correctly", () => {
  const e = unitEconomics([sale(0.01, 0.000021), sale(0.01, 0.000019)]);
  assert.equal(e.calls, 2);
  assert.equal(e.revenue, 0.02);
  assert.equal(e.settlementCost, 0.00004);
  assert.equal(e.grossProfit, 0.01996);
});

test("average cost divides by MEASURED settlements only, never by all of them", () => {
  // Ba lượt bán, chỉ một lượt đo được phí. Chia cho 3 sẽ ra 0.000007 và agent
  // tưởng mình rẻ gấp ba lần thực tế — rồi định giá dưới giá vốn.
  const e = unitEconomics([sale(0.01, 0.000021), sale(0.01), sale(0.01)]);
  assert.equal(e.costMeasured, 1);
  assert.equal(e.costUnmeasured, 2);
  assert.equal(e.avgCostPerCall, 0.000021);
});

test("counts settled sales only, not the ones still owed a delivery", () => {
  const rows = [sale(0.01, 0.00002), { chain: CHAIN, type: "revenue", status: "owed", amountUsdc: 0.01 }];
  const e = unitEconomics(rows);
  assert.equal(e.calls, 1);
  assert.equal(e.owed, 1);
});

test("ignores rows that are not revenue", () => {
  const rows = [sale(0.01, 0.00002), { chain: CHAIN, type: "decision", action: "transfer", amount: 5 }];
  assert.equal(unitEconomics(rows).revenue, 0.01);
});

// --- nguồn của con số chi phí -------------------------------------------

test("prefers cost measured from the settlements themselves", () => {
  const e = unitEconomics([sale(0.01, 0.00005), sweep(0.000021)], CHAIN);
  assert.equal(e.costSource, "settlement");
  assert.equal(e.observedCost, 0.00005);
});

test("falls back to transfer fees when no settlement was measurable, and says which source it used", () => {
  const e = unitEconomics([sale(0.01), sweep(0.000021), sweep(0.000019)], CHAIN);
  assert.equal(e.costSource, "transfer-fee");
  assert.equal(e.observedCost, 0.00002);
  assert.equal(e.avgCostPerCall, null, "không được giả vờ đã đo được từ lượt thu");
});

test("returns null when there is no data, never 0", () => {
  const e = unitEconomics([sale(0.01), sweep()], CHAIN);
  assert.equal(e.observedCost, null);
  assert.equal(e.costSource, null);
});

test("counts fees from executed actions only", () => {
  // Lệnh bị guard chặn không tốn phí nào; đưa nó vào bình quân là bịa dữ liệu.
  const blocked = { chain: CHAIN, type: "decision", executed: false, blocked: "vượt trần" };
  const e = unitEconomics([blocked, sweep(0.00002)], CHAIN);
  assert.equal(e.feeSamples, 1);
  assert.equal(e.observedCost, 0.00002);
});

test("never averages fees across chains — PathUSD and sponsored ETH gas are different units", () => {
  // Phí Tempo tính bằng PathUSD, phí Base là gas ETH được tài trợ. Cộng chung
  // ra một số vô nghĩa, rồi agent định giá dựa trên số vô nghĩa đó.
  const rows = [
    sweep(0.000021),
    { chain: "Base Sepolia", type: "decision", executed: true, feeInToken: 5 },
  ];
  const e = unitEconomics(rows, CHAIN);
  assert.equal(e.feeSamples, 1);
  assert.equal(e.observedCost, 0.000021);
  assert.equal(e.chain, CHAIN);
});

// --- định giá ----------------------------------------------------------

test("prices at the list price when cost is unmeasured, and labels it as such", () => {
  const q = quote({ observedCost: null });
  assert.equal(q.sell, true);
  assert.equal(q.price, 0.01);
  assert.equal(q.basis, "configured");
  assert.equal(q.observedCost, null);
});

test("low cost leaves the list price standing — it never undercuts itself", () => {
  // Sàn = 0.000021 × 1.5 = 0.0000315, thấp hơn giá niêm yết nhiều.
  const q = quote({ observedCost: 0.000021 });
  assert.equal(q.price, 0.01);
  assert.equal(q.basis, "configured");
});

test("rising cost lifts the price to the floor", () => {
  // Sàn = 0.02 × 1.5 = 0.03 > giá niêm yết 0.01
  const q = quote({ observedCost: 0.02 });
  assert.equal(q.sell, true);
  assert.equal(q.price, 0.03);
  assert.equal(q.basis, "cost-plus");
});

test("when the floor clears the ceiling it STOPS SELLING rather than sell at a loss", () => {
  // Sàn = 0.04 × 1.5 = 0.06 > trần 0.05
  const q = quote({ observedCost: 0.04 });
  assert.equal(q.sell, false);
  assert.equal(q.price, null);
  assert.equal(q.basis, "refused");
  assert.match(q.why, /vượt trần/);
});

test("sells exactly at the ceiling, stops just past it", () => {
  // Sàn đúng bằng trần 0.05 → chi phí 0.05/1.5
  assert.equal(quote({ observedCost: 0.05 / 1.5 }).sell, true);
  assert.equal(quote({ observedCost: 0.0334 }).sell, false);
});

test("the required margin is actually enforced, not decorative", () => {
  const q = quote({ observedCost: 0.02, minMargin: 0.5, configuredPrice: 0 });
  assert.equal(q.price, 0.03);
  assert.ok(q.price > 0.02, "giá phải cao hơn giá vốn");
});

test("a zero margin sells at cost, never below", () => {
  const q = quote({ observedCost: 0.02, minMargin: 0, configuredPrice: 0 });
  assert.equal(q.price, 0.02);
});

test("prices round to 6 decimals, matching the token", () => {
  const q = quote({ observedCost: 0.0000071, minMargin: 0.5, configuredPrice: 0 });
  assert.equal(String(q.price).split(".")[1].length <= 6, true);
});
