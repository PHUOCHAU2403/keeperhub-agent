// Đọc receipt thẳng từ RPC công khai — KHÔNG hỏi lại KeeperHub.
//
// Có chủ đích: API vừa là bên thực thi vừa là bên báo cáo kết quả, nên hỏi nó
// "lệnh của tôi xong chưa" là để một bên tự chấm điểm mình. Lần chạy đầu tiên
// đã dạy đúng bài đó — API báo thành công, còn receipt trên chain thì `from` là
// một địa chỉ lạ và `value` bằng 0, khiến mình tưởng giao dịch hỏng. Hoá ra API
// nói đúng, nhưng mình chỉ biết được điều đó SAU KHI tự đi đọc chain.
//
// Từ đó thành nguyên tắc: chain là trọng tài, API chỉ là người đưa tin.

import { config, fromUnits } from "./config.js";
import { decodeMemo } from "./memo.js";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_WITH_MEMO = "0x57bc7354aa85aed339e000bccffabbc529466af35f0772c8f8ee1145927de7f0";

const addrFromTopic = (t) => "0x" + t.slice(-40);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

async function rpc(method, params) {
  const res = await fetch(config.chain.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${config.chain.rpc} trả ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

/**
 * Bóc một receipt thành những con số agent cần cho sổ sách.
 *
 * Trả về null nếu chưa có receipt (giao dịch chưa vào block) — người gọi phân
 * biệt được "chưa xong" với "hỏng", hai thứ này không được lẫn.
 */
export async function readReceipt(txHash) {
  const r = await rpc("eth_getTransactionReceipt", [txHash]);
  if (!r) return null;

  const transfers = [];
  let memo = null;

  for (const log of r.logs ?? []) {
    if (!same(log.address, config.chain.token.address)) continue;
    const [topic0, from, to, third] = log.topics;

    if (topic0 === TRANSFER && from && to) {
      transfers.push({
        from: addrFromTopic(from),
        to: addrFromTopic(to),
        amount: fromUnits(log.data),
      });
    } else if (topic0 === TRANSFER_WITH_MEMO && third) {
      // memo là tham số indexed → nằm ở topic[3], không nằm trong data.
      memo = decodeMemo(third);
    }
  }

  // Trên Tempo không có token native: phí thu bằng chính stablecoin đang chuyển
  // và hiện ra như một Transfer nữa về feeCollector. Nên chi phí vận hành của
  // agent đọc được cùng đơn vị với doanh thu, ngay trong cùng một receipt.
  const feeLeg = config.chain.feeCollector
    ? transfers.find((t) => same(t.to, config.chain.feeCollector))
    : null;

  return {
    txHash,
    success: r.status === "0x1",
    from: r.from,
    to: r.to,
    blockNumber: Number(r.blockNumber),
    gasUsed: Number(r.gasUsed),
    memo,
    // Phí tính bằng token, chỉ có trên chain trả phí bằng stablecoin. Ở nơi
    // khác để null — đừng bịa số 0, "không đo được" khác "bằng không".
    feeInToken: feeLeg ? feeLeg.amount : null,
    transfers,
  };
}
