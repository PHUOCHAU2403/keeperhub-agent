// Dịch vụ trả phí — nơi doanh thu của agent chảy vào.
//
//   node --env-file=.env src/server.js       -> http://localhost:4182
//
//   GET /signal            402 + yêu cầu thanh toán
//   GET /signal + PAYMENT  settle qua KeeperHub -> 200 + tín hiệu
//   GET /ledger            sổ cái công khai (miễn phí)
//   GET /                  trang mô tả (miễn phí)
//
// Sinh dữ liệu chạy SAU khi settle xong. Nếu nguồn dữ liệu chết thì người mua
// không mất tiền — cùng nguyên tắc đã cứu một hoá đơn hồi xây rail trên Arc,
// khi Binance bắt đầu chặn egress giữa chừng.

import { createServer } from "node:http";
import { config, money } from "./config.js";
import * as kh from "./keeperhub.js";
import { readReceipt } from "./receipt.js";
import { challenge, readPayment, settlementCall } from "./x402.js";
import { unitEconomics, quote } from "./economics.js";
import { renderDashboard } from "./dashboard.js";
import { fairValue } from "./signal.js";
import { record, readLedger, summary } from "./ledger.js";

const PORT = Number(process.env.PORT ?? 4182);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/**
 * Giá cho lượt bán kế tiếp, suy ra từ sổ cái chứ không lấy từ hằng số.
 *
 * Gọi lại mỗi lượt: chi phí settle thay đổi theo tình trạng mạng, nên giá đọc
 * một lần lúc khởi động sẽ cũ dần mà không ai biết.
 */
const priceNow = () => quote({ observedCost: unitEconomics(readLedger()).observedCost });

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body, null, 2));
};

/**
 * Phí đã trả để thu một khoản, đọc từ receipt trên chain.
 *
 * Trả null khi không đo được — lượt mô phỏng, hoặc chain tính phí bằng token
 * khác. null sẽ được economics.js loại khỏi phép tính bình quân thay vì tính
 * như 0, để agent không tưởng mình rẻ hơn thực tế.
 */
async function costOfSettling(txHash) {
  if (config.simulate || !txHash) return null;
  try {
    const r = await readReceipt(txHash);
    return r?.feeInToken ?? null;
  } catch (e) {
    log(`không đọc được phí settle: ${e.message}`);
    return null;
  }
}

async function paidSignal(req, res) {
  // Trước khi báo giá, agent hỏi sổ của chính nó xem lượt bán này có lãi không.
  // Đây là lần đầu bảng cân đối được quyền CHẶN một hành động, thay vì chỉ ghi
  // lại sau khi hành động đã xảy ra.
  const q = priceNow();
  if (!q.sell) {
    log(`⛔ ngừng bán: ${q.why}`);
    record({ type: "revenue", status: "refused", reason: q.why, observedCost: q.observedCost, floor: q.floor });
    return json(res, 503, {
      error: "not selling at a profit right now",
      detail: q.why,
      observedSettlementCost: q.observedCost,
      priceFloor: q.floor,
      maxPrice: config.pricing.maxPrice,
    });
  }

  const PRICE = q.price;
  const payment = readPayment(req, { priceUsdc: PRICE });

  if (!payment.ok) {
    log(`402 · ${money(PRICE)} (${q.basis}) · ${payment.why}`);
    return challenge(res, req, {
      priceUsdc: PRICE,
      description: "Live fair-value and mispricing signal for short-dated crypto prediction markets.",
      path: "/signal",
    });
  }

  // Settle TRƯỚC khi sinh dữ liệu, nhưng chỉ giao dữ liệu khi settle thật xong.
  let settled;
  try {
    const call = settlementCall(payment);
    const started = await kh.contractCall(call);
    settled = started.executionId ? await kh.waitFor(started.executionId) : started;
  } catch (e) {
    log(`settle lỗi: ${e.message}`);
    return json(res, 402, { error: "settlement failed", detail: e.message });
  }

  const ok = ["completed", "simulated", "success"].includes(settled.status) && !settled.error;
  if (!ok) {
    log(`settle không thành: ${settled.status}`);
    return json(res, 402, { error: "settlement not confirmed", status: settled.status });
  }

  let data;
  try {
    data = await fairValue();
  } catch (e) {
    // Đã thu tiền mà không giao được hàng — ghi lại để còn hoàn.
    log(`❌ đã settle nhưng nguồn dữ liệu chết: ${e.message}`);
    record({ type: "revenue", status: "owed", amountUsdc: PRICE, from: payment.authorization.from,
             txHash: settled.transactionHash ?? null, error: e.message });
    return json(res, 503, { error: "paid but upstream data unavailable", detail: e.message, owed: true });
  }

  // Thu tiền xong thì đo luôn việc thu đó tốn bao nhiêu. Không đo ngay thì mãi
  // mãi không đo được: sau này chỉ còn số tiền vào, không còn dấu vết chi phí.
  const settlementCost = await costOfSettling(settled.transactionHash);

  record({
    type: "revenue", status: "settled", amountUsdc: PRICE,
    priceBasis: q.basis,
    settlementCost,
    from: payment.authorization.from,
    executionId: settled.executionId ?? null,
    txHash: settled.transactionHash ?? null,
    txLink: settled.transactionLink ?? null,
    simulated: config.simulate,
  });
  log(
    `💰 +${money(PRICE)} (${q.basis}) từ ${payment.authorization.from.slice(0, 10)}… ` +
    `${settled.transactionHash ?? "(mô phỏng)"}` +
    (settlementCost != null ? ` · phí ${money(settlementCost)}` : "")
  );

  json(res, 200, {
    resource: "/signal",
    data,
    payment: {
      amountUsdc: String(PRICE),
      from: payment.authorization.from,
      settledVia: "keeperhub",
      chain: config.chain.name,
      txHash: settled.transactionHash ?? null,
      simulated: config.simulate,
    },
  });
}

createServer(async (req, res) => {
  const path = (req.url || "/").split("?")[0];
  try {
    if (path === "/signal") return await paidSignal(req, res);
    if (path === "/ledger")
      return json(res, 200, {
        summary: summary(),
        economics: unitEconomics(readLedger()),
        entries: readLedger().slice(-50),
      });
    const q = priceNow();

    // Trình duyệt xem trang, máy đọc JSON — cùng một URL, cùng một nguồn số.
    if ((req.headers.accept || "").includes("text/html")) {
      const rows = readLedger();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(
        renderDashboard({ economics: unitEconomics(rows), summary: summary(), entries: rows, quote: q })
      );
    }

    return json(res, 200, {
      service: "An agent with its own balance sheet",
      chain: config.chain.name,
      wallet: config.wallet,
      simulate: config.simulate,
      pricing: {
        current: q.price,
        basis: q.basis,
        observedSettlementCost: q.observedCost,
        minMargin: config.pricing.minMargin,
        maxPrice: config.pricing.maxPrice,
        note: "Price is derived from measured settlement cost, not fixed. The agent stops selling rather than sell below its floor.",
      },
      endpoints: {
        "GET /signal": `${q.sell ? q.price : "not selling"} ${config.chain.token.symbol} — x402 exact, settled through KeeperHub`,
        "GET /ledger": "free — every decision, every payment, and the unit economics",
      },
    });
  } catch (e) {
    log(`lỗi: ${e.message}`);
    json(res, 500, { error: e.message });
  }
}).listen(PORT, () => {
  const q = priceNow();
  log(`dịch vụ chạy · http://localhost:${PORT} · ${config.chain.name} · ${config.simulate ? "MÔ PHỎNG" : "THẬT"}`);
  log(
    q.sell
      ? `/signal giá ${money(q.price)} (${q.basis}) · thu về ${config.wallet}`
      : `/signal NGỪNG BÁN · ${q.why}`
  );
});
