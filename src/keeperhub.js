// Client mỏng cho KeeperHub REST API.
//
// Chỉ bọc đúng bốn thứ agent cần: đọc số dư, chuyển token, gọi contract, và
// theo dõi kết quả. Không cố bọc toàn bộ API — thứ không dùng thì không viết.

import { config, units, fromUnits } from "./config.js";
import { encodeMemo } from "./memo.js";

const ERC20_BALANCE_ABI = JSON.stringify([
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
]);

// TIP-20 — phần Tempo thêm vào ERC-20. `memo` là tham số indexed, nên lọc giao
// dịch theo tham chiếu được ngay ở tầng log mà không phải quét toàn bộ block.
//
// `outputs: []` — KHÔNG phải bool như transfer() của ERC-20.
//
// Khai bool ở đây làm lệnh hỏng với thông báo `could not decode result data
// (value="0x")`: contract trả về rỗng, còn bên gọi thì đang chờ 32 byte. Chỗ
// mất thời gian là thông báo đó nói về tầng giải mã của ethers, không nói rằng
// ABI mình khai lệch với contract — mà đó mới là nguyên nhân.
const TIP20_MEMO_ABI = JSON.stringify([
  {
    name: "transferWithMemo",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "memo", type: "bytes32" },
    ],
    outputs: [],
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

/** Số dư stablecoin của chain đang chạy, quy về đơn vị người đọc được. */
export async function balance(address = config.wallet) {
  const r = await call("/execute/contract-call", {
    body: {
      contractAddress: config.chain.token.address,
      chainId: config.chain.id,
      functionName: "balanceOf",
      functionArgs: JSON.stringify([address]),
      abi: ERC20_BALANCE_ABI,
    },
  });
  return fromUnits(r.result ?? r ?? 0);
}

/**
 * Chuyển tiền trơn. `simulate` đi thẳng vào request — KeeperHub sẽ kiểm tra mọi
 * thứ nhưng không phát lên chain, nên vòng lặp chạy thật được mà không tốn gì.
 */
export async function transfer({ to, amount, idempotencyKey }) {
  return call("/execute/transfer", {
    idempotencyKey,
    body: {
      chainId: config.chain.id,
      recipientAddress: to,
      amount: String(amount),
      tokenAddress: config.chain.token.address,
      ...(config.simulate ? { simulate: true } : {}),
    },
  });
}

/**
 * Chuyển tiền KÈM tham chiếu đối soát, qua TIP-20 của Tempo.
 *
 * Phải đi đường contract-call chứ không dùng /execute/transfer: endpoint
 * transfer chỉ biết `transfer(address,uint256)` chuẩn ERC-20, không có chỗ nào
 * nhét memo vào. Đây cũng là lý do agent giữ contractCall làm nguyên thuỷ —
 * mọi thứ ngoài ERC-20 chuẩn đều phải chui qua cửa đó.
 */
export async function transferWithMemo({ to, amount, memo, idempotencyKey }) {
  if (!config.chain.memo) {
    throw new Error(`${config.chain.name} không hỗ trợ memo trên chain`);
  }
  return call("/execute/contract-call", {
    idempotencyKey,
    body: {
      contractAddress: config.chain.token.address,
      chainId: config.chain.id,
      functionName: "transferWithMemo",
      functionArgs: JSON.stringify([to, units(amount), encodeMemo(memo)]),
      abi: TIP20_MEMO_ABI,
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
