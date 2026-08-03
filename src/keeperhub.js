// Client mỏng cho KeeperHub REST API.
//
// Chỉ bọc đúng bốn thứ agent cần: đọc số dư, chuyển token, gọi contract, và
// theo dõi kết quả. Không cố bọc toàn bộ API — thứ không dùng thì không viết.

import { config } from "./config.js";

const ERC20_BALANCE_ABI = JSON.stringify([
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
]);

class KeeperHubError extends Error {
  constructor(status, body) {
    const d = body?.detail || body?.error || JSON.stringify(body).slice(0, 200);
    super(`KeeperHub ${status}: ${d}`);
    this.status = status;
    this.body = body;
  }
}

async function call(path, { method = "POST", body, idempotencyKey } = {}) {
  if (!config.api.key) throw new Error("KEEPERHUB_API_KEY chưa được đặt (xem .env.example)");

  const headers = {
    authorization: `Bearer ${config.api.key}`,
    "content-type": "application/json",
  };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

  const res = await fetch(config.api.base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 300) }; }

  if (!res.ok) throw new KeeperHubError(res.status, json);
  return json.data ?? json;
}

/** Số dư USDC, trả về đơn vị người đọc được (USDC có 6 chữ số thập phân). */
export async function usdcBalance(address = config.wallet) {
  const r = await call("/execute/contract-call", {
    body: {
      contractAddress: config.chain.usdc,
      chainId: config.chain.id,
      functionName: "balanceOf",
      functionArgs: JSON.stringify([address]),
      abi: ERC20_BALANCE_ABI,
    },
  });
  const raw = BigInt(r.result ?? r ?? 0);
  return Number(raw) / 1e6;
}

/**
 * Chuyển USDC. `simulate` đi thẳng vào request — KeeperHub sẽ kiểm tra mọi thứ
 * nhưng không phát lên chain, nên vòng lặp chạy thật được mà không tốn gì.
 */
export async function transferUsdc({ to, amount, idempotencyKey }) {
  return call("/execute/transfer", {
    idempotencyKey,
    body: {
      chainId: config.chain.id,
      recipientAddress: to,
      amount: String(amount),
      tokenAddress: config.chain.usdc,
      ...(config.simulate ? { simulate: true } : {}),
    },
  });
}

/**
 * Gọi contract tuỳ ý. Hàm view trả thẳng kết quả; hàm ghi trả executionId.
 * Đây là đường agent settle uỷ quyền EIP-3009 của x402 — nên doanh thu cũng
 * chảy qua KeeperHub, không chỉ khoản chi.
 */
export async function contractCall({ idempotencyKey, ...body }) {
  return call("/execute/contract-call", {
    idempotencyKey,
    body: { ...body, ...(config.simulate ? { simulate: true } : {}) },
  });
}

export async function executionStatus(executionId) {
  return call(`/execute/${executionId}/status`, { method: "GET" });
}

/**
 * Chờ giao dịch xong. KeeperHub thường trả "completed" ngay, nhưng khi mạng
 * tắc thì nó ở "pending" — agent không được coi là xong khi chưa xong.
 */
export async function waitFor(executionId, { timeoutMs = 90_000, everyMs = 3_000 } = {}) {
  const until = Date.now() + timeoutMs;
  let last;
  while (Date.now() < until) {
    last = await executionStatus(executionId);
    if (last.status && !["pending", "running", "queued"].includes(last.status)) return last;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return { ...last, status: last?.status ?? "timeout", timedOut: true };
}
