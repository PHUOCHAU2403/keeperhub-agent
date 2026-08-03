// Kiểm chứng phần quyết định — không mạng, không ví, không API key.
//
//   node --test test/
//
// Mọi thứ liên quan tới tiền phải kiểm chứng được ngoại tuyến. Nếu chỉ biết
// agent hành xử đúng khi đã gọi API thật thì đã quá muộn để biết.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.CHAIN = "base-sepolia";
process.env.SWEEP_FLOOR = "5";
process.env.SWEEP_MIN = "1";
process.env.MAX_PER_ACTION = "50";
process.env.SESSION_BUDGET = "200";
process.env.TREASURY = "0x000000000000000000000000000000000000dEaD";

const { decide, guard } = await import("../src/rules.js");

test("dưới vốn lưu động → không làm gì", () => {
  const i = decide({ usdc: 3 });
  assert.equal(i.skip, true);
  assert.match(i.reason, /Giữ nguyên/);
});

test("dư nhưng chưa tới ngưỡng quét → vẫn không làm gì", () => {
  // 5.5 - 5 = 0.5 dư, dưới mức tối thiểu 1 → không phát giao dịch cho vài xu
  assert.equal(decide({ usdc: 5.5 }).skip, true);
});

test("đúng ngay ngưỡng → quét", () => {
  const i = decide({ usdc: 6 });
  assert.equal(i.skip, undefined);
  assert.equal(i.amount, 1);
  assert.equal(i.rule, "sweepSurplus");
});

test("chỉ quét phần dư, giữ lại vốn lưu động", () => {
  assert.equal(decide({ usdc: 30 }).amount, 25);
});

test("số dư 0 không sinh ra ý định âm", () => {
  const i = decide({ usdc: 0 });
  assert.equal(i.skip, true);
});

test("guard cho qua lệnh hợp lệ", () => {
  assert.equal(guard({ to: "0x000000000000000000000000000000000000dEaD", amount: 10 }, 0), null);
});

test("guard chặn khi vượt trần một lệnh", () => {
  const b = guard({ to: "0x000000000000000000000000000000000000dEaD", amount: 51 }, 0);
  assert.match(b, /trần một lệnh/);
});

test("guard chặn khi vượt ngân sách phiên", () => {
  const b = guard({ to: "0x000000000000000000000000000000000000dEaD", amount: 10 }, 195);
  assert.match(b, /ngân sách phiên/);
});

test("guard chặn địa chỉ sai định dạng", () => {
  assert.match(guard({ to: "0xnothex", amount: 1 }, 0), /địa chỉ/);
  assert.match(guard({ to: "", amount: 1 }, 0), /địa chỉ/);
});

test("guard chặn số tiền không dương", () => {
  assert.match(guard({ to: "0x000000000000000000000000000000000000dEaD", amount: 0 }, 0), /không dương/);
  assert.match(guard({ to: "0x000000000000000000000000000000000000dEaD", amount: -5 }, 0), /không dương/);
});

test("số dư lớn bị guard chặn, không phải bị quy tắc bỏ qua", () => {
  // Quy tắc muốn quét 995; guard mới là thứ chặn lại. Đúng thứ tự trách nhiệm.
  const i = decide({ usdc: 1000 });
  assert.equal(i.amount, 995);
  assert.match(guard(i, 0), /trần một lệnh/);
});
