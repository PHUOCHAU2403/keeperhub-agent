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
import { challenge, readPayment, settlementCall } from "./x402.js";
import { fairValue } from "./signal.js";
import { record, readLedger, summary } from "./ledger.js";

const PORT = Number(process.env.PORT ?? 4182);
const PRICE = Number(process.env.SIGNAL_PRICE ?? 0.01);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body, null, 2));
};

async function paidSignal(req, res) {
  const payment = readPayment(req, { priceUsdc: PRICE });

  if (!payment.ok) {
    log(`402 · ${payment.why}`);
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

  record({
    type: "revenue", status: "settled", amountUsdc: PRICE,
    from: payment.authorization.from,
    executionId: settled.executionId ?? null,
    txHash: settled.transactionHash ?? null,
    txLink: settled.transactionLink ?? null,
    simulated: config.simulate,
  });
  log(`💰 +${money(PRICE)} từ ${payment.authorization.from.slice(0, 10)}… ${settled.transactionHash ?? "(mô phỏng)"}`);

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
    if (path === "/ledger") return json(res, 200, { summary: summary(), entries: readLedger().slice(-50) });
    return json(res, 200, {
      service: "An agent with its own balance sheet",
      chain: config.chain.name,
      wallet: config.wallet,
      simulate: config.simulate,
      endpoints: {
        "GET /signal": `${PRICE} USDC — x402 exact, settled through KeeperHub`,
        "GET /ledger": "free — every decision and every payment",
      },
    });
  } catch (e) {
    log(`lỗi: ${e.message}`);
    json(res, 500, { error: e.message });
  }
}).listen(PORT, () => {
  log(`dịch vụ chạy · http://localhost:${PORT} · ${config.chain.name} · ${config.simulate ? "MÔ PHỎNG" : "THẬT"}`);
  log(`/signal giá ${money(PRICE)} · thu về ${config.wallet}`);
});
