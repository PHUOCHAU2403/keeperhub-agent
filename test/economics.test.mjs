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

test("sổ rỗng không sinh ra số bịa", () => {
  const e = unitEconomics([]);
  assert.equal(e.calls, 0);
  assert.equal(e.revenue, 0);
  assert.equal(e.avgCostPerCall, null);
});

test("cộng đúng doanh thu và chi phí", () => {
  const e = unitEconomics([sale(0.01, 0.000021), sale(0.01, 0.000019)]);
  assert.equal(e.calls, 2);
  assert.equal(e.revenue, 0.02);
  assert.equal(e.settlementCost, 0.00004);
  assert.equal(e.grossProfit, 0.01996);
});

test("chi phí bình quân chỉ chia cho số lượt ĐO ĐƯỢC", () => {
  // Ba lượt bán, chỉ một lượt đo được phí. Chia cho 3 sẽ ra 0.000007 và agent
  // tưởng mình rẻ gấp ba lần thực tế — rồi định giá dưới giá vốn.
  const e = unitEconomics([sale(0.01, 0.000021), sale(0.01), sale(0.01)]);
  assert.equal(e.costMeasured, 1);
  assert.equal(e.costUnmeasured, 2);
  assert.equal(e.avgCostPerCall, 0.000021);
});

test("chỉ tính lượt đã settle, không tính lượt còn nợ hàng", () => {
  const rows = [sale(0.01, 0.00002), { chain: CHAIN, type: "revenue", status: "owed", amountUsdc: 0.01 }];
  const e = unitEconomics(rows);
  assert.equal(e.calls, 1);
  assert.equal(e.owed, 1);
});

test("bỏ qua dòng không phải doanh thu", () => {
  const rows = [sale(0.01, 0.00002), { chain: CHAIN, type: "decision", action: "transfer", amount: 5 }];
  assert.equal(unitEconomics(rows).revenue, 0.01);
});

// --- nguồn của con số chi phí -------------------------------------------

test("ưu tiên chi phí đo từ chính lượt thu", () => {
  const e = unitEconomics([sale(0.01, 0.00005), sweep(0.000021)], CHAIN);
  assert.equal(e.costSource, "settlement");
  assert.equal(e.observedCost, 0.00005);
});

test("không có lượt thu nào đo được thì lùi về phí chuyển khoản, và nói rõ nguồn", () => {
  const e = unitEconomics([sale(0.01), sweep(0.000021), sweep(0.000019)], CHAIN);
  assert.equal(e.costSource, "transfer-fee");
  assert.equal(e.observedCost, 0.00002);
  assert.equal(e.avgCostPerCall, null, "không được giả vờ đã đo được từ lượt thu");
});

test("không có dữ liệu nào thì trả null, không trả 0", () => {
  const e = unitEconomics([sale(0.01), sweep()], CHAIN);
  assert.equal(e.observedCost, null);
  assert.equal(e.costSource, null);
});

test("chỉ đếm phí của lệnh ĐÃ thực thi", () => {
  // Lệnh bị guard chặn không tốn phí nào; đưa nó vào bình quân là bịa dữ liệu.
  const blocked = { chain: CHAIN, type: "decision", executed: false, blocked: "vượt trần" };
  const e = unitEconomics([blocked, sweep(0.00002)], CHAIN);
  assert.equal(e.feeSamples, 1);
  assert.equal(e.observedCost, 0.00002);
});

test("KHÔNG trộn phí giữa các chain", () => {
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

test("chưa đo được chi phí thì bán theo giá cấu hình, và nói rõ", () => {
  const q = quote({ observedCost: null });
  assert.equal(q.sell, true);
  assert.equal(q.price, 0.01);
  assert.equal(q.basis, "configured");
  assert.equal(q.observedCost, null);
});

test("chi phí thấp thì giá cấu hình thắng, không tự hạ giá", () => {
  // Sàn = 0.000021 × 1.5 = 0.0000315, thấp hơn giá niêm yết nhiều.
  const q = quote({ observedCost: 0.000021 });
  assert.equal(q.price, 0.01);
  assert.equal(q.basis, "configured");
});

test("chi phí tăng đủ cao thì giá tự nâng lên sàn", () => {
  // Sàn = 0.02 × 1.5 = 0.03 > giá niêm yết 0.01
  const q = quote({ observedCost: 0.02 });
  assert.equal(q.sell, true);
  assert.equal(q.price, 0.03);
  assert.equal(q.basis, "cost-plus");
});

test("chi phí đẩy sàn vượt trần thì NGỪNG BÁN, không bán lỗ", () => {
  // Sàn = 0.04 × 1.5 = 0.06 > trần 0.05
  const q = quote({ observedCost: 0.04 });
  assert.equal(q.sell, false);
  assert.equal(q.price, null);
  assert.equal(q.basis, "refused");
  assert.match(q.why, /vượt trần/);
});

test("ngay tại trần thì vẫn bán, vượt một chút mới dừng", () => {
  // Sàn đúng bằng trần 0.05 → chi phí 0.05/1.5
  assert.equal(quote({ observedCost: 0.05 / 1.5 }).sell, true);
  assert.equal(quote({ observedCost: 0.0334 }).sell, false);
});

test("biên yêu cầu thực sự được áp, không phải trang trí", () => {
  const q = quote({ observedCost: 0.02, minMargin: 0.5, configuredPrice: 0 });
  assert.equal(q.price, 0.03);
  assert.ok(q.price > 0.02, "giá phải cao hơn giá vốn");
});

test("biên 0 vẫn bán đúng giá vốn, không âm", () => {
  const q = quote({ observedCost: 0.02, minMargin: 0, configuredPrice: 0 });
  assert.equal(q.price, 0.02);
});

test("giá luôn làm tròn 6 chữ số — đúng số thập phân của token", () => {
  const q = quote({ observedCost: 0.0000071, minMargin: 0.5, configuredPrice: 0 });
  assert.equal(String(q.price).split(".")[1].length <= 6, true);
});
