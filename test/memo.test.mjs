// Memo TIP-20 — mã hoá phải khớp với thứ chain thật đã ghi nhận.
//
// Có một trường hợp kiểm chứng bằng dữ liệu thật, không phải bằng giả định:
// giao dịch 0x58a99c37…e7702 trên Tempo Moderato mang memo "INV-KH-001", và
// bytes32 tương ứng đọc thẳng từ topic[3] của event TransferWithMemo. Nếu hàm
// encode ở đây lệch với chain, test này sẽ nói ngay.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.CHAIN = "tempo-moderato";

const { encodeMemo, decodeMemo, sweepMemo } = await import("../src/memo.js");

const REAL_TX_MEMO = "INV-KH-001";
const REAL_TX_BYTES32 =
  "0x494e562d4b482d30303100000000000000000000000000000000000000000000";

test("khớp đúng bytes32 mà chain thật đã ghi", () => {
  assert.equal(encodeMemo(REAL_TX_MEMO), REAL_TX_BYTES32);
});

test("giải mã được memo lấy từ chain thật", () => {
  assert.equal(decodeMemo(REAL_TX_BYTES32), REAL_TX_MEMO);
});

test("encode rồi decode thì về nguyên bản", () => {
  for (const s of ["A", "SWEEP-0001-20260805", "x".repeat(32), "phí 0.000196"]) {
    assert.equal(decodeMemo(encodeMemo(s)), s);
  }
});

test("luôn ra đúng 32 byte, bất kể chuỗi ngắn dài", () => {
  for (const s of ["", "A", "SWEEP-0001-20260805"]) {
    assert.equal(encodeMemo(s).length, 2 + 64);
  }
});

test("quá 32 byte thì ném lỗi, không cắt cụt âm thầm", () => {
  // Cắt cụt là kiểu hỏng tệ nhất ở đây: giao dịch vẫn lên chain, vẫn trông như
  // thành công, nhưng tham chiếu đối soát thì sai — và không ai biết.
  assert.throws(() => encodeMemo("x".repeat(33)), /tối đa 32/);
});

test("đếm theo BYTE chứ không theo ký tự", () => {
  // "ế" (U+1EBF) tốn 3 byte UTF-8, nên 11 ký tự = 33 byte. Đếm theo độ dài
  // chuỗi sẽ thấy 11 và cho qua, rồi hỏng lúc lên chain.
  const s = "ế".repeat(11);
  assert.equal(s.length, 11);
  assert.equal(new TextEncoder().encode(s).length, 33);
  assert.throws(() => encodeMemo(s), /tối đa 32/);

  // Và 10 ký tự = 30 byte thì vẫn phải lọt, không được chặn oan.
  assert.equal(decodeMemo(encodeMemo("ế".repeat(10))), "ế".repeat(10));
});

test("hex sai định dạng thì từ chối", () => {
  assert.throws(() => decodeMemo("0x1234"), /không hợp lệ/);
  assert.throws(() => decodeMemo("không phải hex"), /không hợp lệ/);
});

test("sweepMemo đệm số chu kỳ để sắp xếp được theo thứ tự chuỗi", () => {
  const d = new Date("2026-08-05T00:00:00Z");
  assert.equal(sweepMemo(1, d), "SWEEP-0001-20260805");
  assert.equal(sweepMemo(42, d), "SWEEP-0042-20260805");
  assert.ok(sweepMemo(9, d) < sweepMemo(10, d), "đệm 0 để so chuỗi ra đúng thứ tự");
});
