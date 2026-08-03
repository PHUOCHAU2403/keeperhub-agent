// Phần "suy nghĩ" của agent — thuần hàm, không chạm mạng.
//
// Tách khỏi agent.js có chủ đích: quyết định tiền bạc phải kiểm chứng được mà
// không cần gọi API, không cần ví có tiền, không cần chờ chain. Nhìn vào file
// này là biết agent sẽ làm gì trong mọi tình huống.

import { config, usdc } from "./config.js";

/**
 * Mỗi quy tắc nhận trạng thái cảm nhận được, trả về một ý định — hoặc một ý
 * định có `skip` kèm lý do. Không bao giờ trả về null lặng lẽ: mọi lần agent
 * chọn không làm gì đều phải nói được vì sao.
 */
export const RULES = [
  function sweepSurplus(s) {
    const surplus = s.usdc - config.rules.sweepFloorUsdc;
    if (surplus < config.rules.sweepMinUsdc) {
      return {
        action: "transfer",
        skip: true,
        reason:
          `Dư ${usdc(Math.max(surplus, 0))} — dưới ngưỡng quét ` +
          `${usdc(config.rules.sweepMinUsdc)}. Giữ nguyên.`,
      };
    }
    return {
      action: "transfer",
      to: config.treasury,
      amount: Number(surplus.toFixed(6)),
      reason:
        `Số dư ${usdc(s.usdc)} vượt vốn lưu động ${usdc(config.rules.sweepFloorUsdc)}. ` +
        `Quét phần dư về treasury.`,
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
  if (!/^0x[0-9a-fA-F]{40}$/.test(intent.to || "")) return "địa chỉ nhận không hợp lệ";
  if (!(intent.amount > 0)) return "số tiền không dương";
  if (intent.amount > config.guards.maxPerActionUsdc)
    return `vượt trần một lệnh ${usdc(config.guards.maxPerActionUsdc)}`;
  if (spent + intent.amount > config.guards.sessionBudgetUsdc)
    return `vượt ngân sách phiên (đã chi ${usdc(spent)} / ${usdc(config.guards.sessionBudgetUsdc)})`;
  return null;
}
