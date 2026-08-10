// Phần "suy nghĩ" của agent — thuần hàm, không chạm mạng.
//
// Tách khỏi agent.js có chủ đích: quyết định tiền bạc phải kiểm chứng được mà
// không cần gọi API, không cần ví có tiền, không cần chờ chain. Nhìn vào file
// này là biết agent sẽ làm gì trong mọi tình huống.

import { config, money } from "./config.js";
import { sweepMemo } from "./memo.js";

/**
 * Mỗi quy tắc nhận trạng thái cảm nhận được, trả về một ý định — hoặc một ý
 * định có `skip` kèm lý do. Không bao giờ trả về null lặng lẽ: mọi lần agent
 * chọn không làm gì đều phải nói được vì sao.
 */
export const RULES = [
  function sweepSurplus(s) {
    const surplus = s.balance - config.rules.sweepFloor;
    if (surplus < config.rules.sweepMin) {
      return {
        action: "transfer",
        skip: true,
        reason:
          `Surplus ${money(Math.max(surplus, 0))} is under the ` +
          `${money(config.rules.sweepMin)} minimum. Holding.`,
      };
    }
    return {
      action: "transfer",
      to: config.treasury,
      amount: Number(surplus.toFixed(6)),
      // Tham chiếu đối soát sinh ra ở tầng QUYẾT ĐỊNH, không ở tầng thực thi.
      // Lý do: nó thuộc về việc "vì sao khoản này tồn tại", mà đó là câu hỏi
      // của quy tắc. Chain nào mang được nó lên on-chain là chuyện của tầng
      // dưới — ý định thì giống hệt nhau ở mọi chain.
      memo: sweepMemo(s.cycle ?? 0),
      reason:
        `Balance ${money(s.balance)} exceeds the ${money(config.rules.sweepFloor)} working-capital floor. ` +
        `Sweeping the surplus to treasury.`,
    };
  },
];

export function decide(state) {
  for (const rule of RULES) {
    const intent = rule(state);
    if (intent) return { ...intent, rule: rule.name };
  }
  return null;
}

/**
 * Chạy TRƯỚC mọi lệnh gọi API. Một agent cầm tiền phải từ chối được chính nó.
 * `spent` truyền vào thay vì tự đọc sổ cái — để test được mà không cần file.
 */
export function guard(intent, spent = 0) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(intent.to || "")) return "recipient address is malformed";
  if (!(intent.amount > 0)) return "amount is not positive";
  if (intent.amount > config.guards.maxPerAction)
    return `over the ${money(config.guards.maxPerAction)} per-action cap`;
  if (spent + intent.amount > config.guards.sessionBudget)
    return `over the session budget (spent ${money(spent)} of ${money(config.guards.sessionBudget)})`;
  return null;
}
