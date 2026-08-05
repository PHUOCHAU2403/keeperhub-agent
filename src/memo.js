// Memo TIP-20 — tham chiếu đối soát gắn thẳng vào giao dịch.
//
// Trên Base, một khoản USDC về treasury chỉ là một con số: muốn biết nó ứng với
// chu kỳ nào thì phải tra sổ ngoài chain, và sổ đó do agent tự giữ. Trên Tempo,
// `transferWithMemo` mang theo 32 byte tham chiếu, và memo được INDEX (topic[3]
// của event TransferWithMemo) nên lọc theo memo được ngay ở tầng log.
//
// Chọn ASCII đọc được thay vì hash. Hash chỉ đối soát được khi đã cầm bảng tra;
// chuỗi đọc được thì ai mở chain lên cũng hiểu — kể cả kiểm toán viên không có
// sổ của agent. Đây là điểm khác biệt duy nhất đáng giá của memo, nên đừng làm
// hỏng nó bằng cách nhét hash vào.
//
// Kiểm chứng trên chain thật: giao dịch 0x58a99c37…e7702 mang memo
// 0x494e562d4b482d3030310000… giải ra đúng "INV-KH-001".

const MAX_BYTES = 32;

/** Chuỗi → bytes32 hex, đệm 0 bên phải. Ném lỗi nếu quá 32 byte. */
export function encodeMemo(text) {
  const bytes = new TextEncoder().encode(String(text));
  if (bytes.length > MAX_BYTES) {
    throw new Error(`memo "${text}" dài ${bytes.length} byte, tối đa ${MAX_BYTES}`);
  }
  const padded = new Uint8Array(MAX_BYTES);
  padded.set(bytes);
  return "0x" + Buffer.from(padded).toString("hex");
}

/** bytes32 hex → chuỗi, cắt bỏ phần đệm. Ngược đúng với encodeMemo. */
export function decodeMemo(hex) {
  const clean = String(hex).replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error(`memo hex không hợp lệ: ${hex}`);
  return Buffer.from(clean, "hex").toString("utf8").replace(/\0+$/, "");
}

/**
 * Tham chiếu cho một lượt quét doanh thu.
 *
 * Dạng SWEEP-<chu kỳ>-<ngày> — 19 byte, còn dư chỗ trong 32. Chu kỳ và ngày là
 * đủ để khớp một dòng trên chain với một dòng trong sổ cái, mà không nhét số
 * tiền vào: số tiền đã nằm sẵn trong chính giao dịch, chép lại chỉ tạo thêm một
 * chỗ để hai nguồn mâu thuẫn nhau.
 */
export function sweepMemo(cycle, at = new Date()) {
  const day = at.toISOString().slice(0, 10).replace(/-/g, "");
  return `SWEEP-${String(cycle).padStart(4, "0")}-${day}`;
}
