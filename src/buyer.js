// Client mua — chứng minh vòng x402 chạy đầu-cuối bằng một ví thật bên ngoài.
//
//   node --env-file=.env src/buyer.js [url]
//
// Đây là phía ĐỐI DIỆN của server.js: nó nhận 402, ký uỷ quyền EIP-3009 cho
// đúng số tiền, rồi gọi lại kèm header PAYMENT. Không dùng thư viện x402 nào —
// viết tay để thấy rõ từng bước, và để chứng minh mình hiểu giao thức chứ
// không chỉ gọi SDK.
//
// Cần BUYER_PRIVATE_KEY trong .env — ví riêng của người mua, KHÔNG phải ví agent.

import { createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { randomBytes } from "node:crypto";

const URL = process.argv[2] || "http://localhost:4182/signal";
const PK = process.env.BUYER_PRIVATE_KEY;
if (!PK) { console.error("thiếu BUYER_PRIVATE_KEY trong .env"); process.exit(1); }

const account = privateKeyToAccount(PK.startsWith("0x") ? PK : `0x${PK}`);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");

console.log("người mua:", account.address);

// ── 1. xin hàng, nhận 402 ──────────────────────────────────────────────────
const first = await fetch(URL);
if (first.status !== 402) {
  console.log(`không phải 402 (${first.status}) — server không đòi tiền?`);
  process.exit(1);
}
const reqs = JSON.parse(Buffer.from(first.headers.get("payment-required"), "base64").toString());
const terms = reqs.accepts[0];
const chainId = Number(terms.network.split(":")[1]);
console.log(`402 · ${Number(terms.amount) / 1e6} USDC · ${terms.scheme} · chain ${chainId}`);

// ── 2. đọc EIP-712 domain TỪ CHAIN, không đoán ─────────────────────────────
//
// Tên và version domain khác nhau giữa các bản triển khai USDC. Đoán sai thì
// chữ ký hợp lệ về mặt hình dạng nhưng contract từ chối — lỗi rất khó truy.
const chain = chainId === 8453 ? base : baseSepolia;
const pub = createPublicClient({ chain, transport: http() });
const [name, version] = await Promise.all([
  pub.readContract({ address: terms.asset, abi: parseAbi(["function name() view returns (string)"]), functionName: "name" }),
  pub.readContract({ address: terms.asset, abi: parseAbi(["function version() view returns (string)"]), functionName: "version" }),
]);
console.log(`domain: name="${name}" version="${version}"`);

// ── 3. ký uỷ quyền ─────────────────────────────────────────────────────────
const now = Math.floor(Date.now() / 1000);
const authorization = {
  from: account.address,
  to: terms.payTo,
  value: BigInt(terms.amount),
  validAfter: 0n,
  validBefore: BigInt(now + (terms.maxTimeoutSeconds ?? 300)),
  nonce: `0x${randomBytes(32).toString("hex")}`,
};

const signature = await account.signTypedData({
  domain: { name, version, chainId, verifyingContract: terms.asset },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: authorization,
});
console.log("đã ký uỷ quyền EIP-3009");

// ── 4. gọi lại kèm thanh toán ──────────────────────────────────────────────
const paid = await fetch(URL, {
  headers: {
    PAYMENT: b64({
      x402Version: 2,
      scheme: terms.scheme,
      network: terms.network,
      payload: {
        signature,
        authorization: {
          ...authorization,
          value: String(authorization.value),
          validAfter: String(authorization.validAfter),
          validBefore: String(authorization.validBefore),
        },
      },
    }),
  },
});

const body = await paid.json();
console.log(`\n→ HTTP ${paid.status}`);
if (paid.status === 200) {
  console.log("thanh toán:", JSON.stringify(body.payment, null, 1));
  console.log(`tín hiệu  : ${body.data.counts.markets} market · ${body.data.counts.signals} tín hiệu`);
  const live = (body.data.markets || []).filter((m) => m.status === "live").slice(0, 3);
  live.forEach((m) => console.log(`   ${m.market.slice(0, 44)}  fair ${m.fairValue}  ask ${m.bestAsk}  ${m.signal}`));
} else {
  console.log(JSON.stringify(body, null, 1).slice(0, 600));
}
