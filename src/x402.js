// Phía BÁN của x402 — cách doanh thu chảy vào agent.
//
// Trên Base, USDC là ERC-20 chuẩn có EIP-3009, nên dùng được scheme `exact`
// của x402 thay vì phải tự chế. (Trên Arc thì không: USDC ở đó là token native,
// không có transferWithAuthorization để ký, nên bản trước phải bind hoá đơn qua
// một contract router riêng.)
//
// Điểm đáng nói: bước settle — gọi transferWithAuthorization để kéo USDC từ ví
// người mua — chạy QUA KEEPERHUB. Nên KeeperHub là lớp thực thi cho cả đầu thu
// lẫn đầu chi, không chỉ đầu chi.

import { randomBytes } from "node:crypto";
import { config } from "./config.js";

const USDC_EIP3009_ABI = JSON.stringify([
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
]);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
const unb64 = (s) => JSON.parse(Buffer.from(s, "base64").toString("utf8"));

/** Giá tính bằng đơn vị nhỏ nhất — USDC 6 chữ số thập phân. */
const toUnits = (usdcAmount) => String(Math.round(usdcAmount * 1e6));

/**
 * Yêu cầu thanh toán theo x402 v2. Trả trong header `PAYMENT-REQUIRED` dạng
 * base64, kèm cả trong body cho người đọc bằng mắt.
 */
export function paymentRequirements({ resourceUrl, priceUsdc, description }) {
  return {
    x402Version: 2,
    error: "Payment required",
    resource: { url: resourceUrl, description, mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network: `eip155:${config.chain.id}`,
        amount: toUnits(priceUsdc),
        asset: config.chain.usdc,
        payTo: config.wallet,
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", decimals: 6, version: "2" },
      },
    ],
  };
}

export function challenge(res, req, { priceUsdc, description, path }) {
  const resourceUrl = `http://${req.headers.host}${path}`;
  const reqs = paymentRequirements({ resourceUrl, priceUsdc, description });
  res.writeHead(402, {
    "content-type": "application/json",
    "payment-required": b64(reqs),
    "access-control-expose-headers": "PAYMENT-REQUIRED",
  });
  res.end(JSON.stringify({ ...reqs, how: "Sign an EIP-3009 authorization for the amount above and retry with a PAYMENT header." }, null, 2));
}

/**
 * Đọc header `PAYMENT` của người mua và kiểm tra nó khớp với thứ mình đòi.
 *
 * Kiểm tra ở đây là kiểm tra hình dạng và điều khoản — chữ ký thì để USDC tự
 * xác minh khi settle. Contract mới là trọng tài cuối; kiểm ở tầng ứng dụng chỉ
 * để từ chối sớm những payload sai rành rành, không phải để thay thế nó.
 */
export function readPayment(req, { priceUsdc }) {
  const raw = req.headers["payment"] || req.headers["x-payment"];
  if (!raw) return { ok: false, why: "thiếu header PAYMENT" };

  let p;
  try { p = unb64(String(raw)); } catch { return { ok: false, why: "PAYMENT không giải mã được base64/JSON" }; }

  const a = p?.payload?.authorization;
  if (!a) return { ok: false, why: "payload thiếu authorization" };
  if (p.scheme !== "exact") return { ok: false, why: `scheme không hỗ trợ: ${p.scheme}` };
  if (p.network !== `eip155:${config.chain.id}`)
    return { ok: false, why: `sai mạng: ${p.network}` };
  if (String(a.to).toLowerCase() !== config.wallet.toLowerCase())
    return { ok: false, why: "người nhận không phải ví của dịch vụ này" };
  if (BigInt(a.value || 0) < BigInt(toUnits(priceUsdc)))
    return { ok: false, why: `trả thiếu: ${a.value} < ${toUnits(priceUsdc)}` };

  const now = Math.floor(Date.now() / 1000);
  if (Number(a.validBefore) <= now) return { ok: false, why: "uỷ quyền đã hết hạn" };
  if (Number(a.validAfter) > now) return { ok: false, why: "uỷ quyền chưa tới hiệu lực" };

  const sig = p.payload.signature;
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig || "")) return { ok: false, why: "chữ ký sai định dạng" };

  return { ok: true, authorization: a, signature: sig };
}

/**
 * Settle: gọi transferWithAuthorization trên USDC — qua KeeperHub.
 * Nonce của uỷ quyền dùng luôn làm khoá idempotency: mỗi uỷ quyền chỉ settle
 * được một lần, kể cả khi mạng lỗi và agent thử lại.
 */
export function settlementCall({ authorization, signature }) {
  return {
    contractAddress: config.chain.usdc,
    chainId: config.chain.id,
    functionName: "transferWithAuthorization",
    functionArgs: JSON.stringify([
      authorization.from,
      authorization.to,
      String(authorization.value),
      String(authorization.validAfter),
      String(authorization.validBefore),
      authorization.nonce,
      signature,
    ]),
    abi: USDC_EIP3009_ABI,
    idempotencyKey: `x402-${authorization.nonce}`,
  };
}

/** Nonce ngẫu nhiên cho phía mua (dùng khi agent tự đi mua ở bước sau). */
export const freshNonce = () => "0x" + randomBytes(32).toString("hex");
