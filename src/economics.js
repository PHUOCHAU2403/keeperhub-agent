// Đơn vị kinh tế của agent — thuần hàm, đọc sổ cái, không chạm mạng.
//
// Đây là chỗ bảng cân đối thôi làm báo cáo và bắt đầu điều khiển hành vi.
// Trước file này agent biết nó thu bao nhiêu và trả phí bao nhiêu, nhưng chưa
// bao giờ dùng hai con số đó để quyết định gì. Một cuốn sổ không ai đọc thì
// không phải bảng cân đối, chỉ là nhật ký.
//
// Ba điều rút ra từ sổ, không phải từ giả định:
//   - đã thu thật bao nhiêu, qua bao nhiêu lượt bán
//   - mỗi lượt thu tốn bao nhiêu phí settle (chỉ đo được ở chain thu phí bằng
//     stablecoin — nơi khác trả lời "không biết", không trả lời 0)
//   - ở mức giá đang đặt, còn lại gì không

import { config } from "./config.js";

/**
 * Tổng kết lãi lỗ từ các dòng sổ cái.
 *
 * `costMeasured` tách khỏi `calls` có chủ đích: trung bình chi phí chỉ được
 * chia cho số lượt ĐO ĐƯỢC. Chia cho tổng số lượt sẽ kéo trung bình xuống mỗi
 * khi có lượt không đo được, và agent sẽ tưởng mình rẻ hơn thực tế.
 */
export function unitEconomics(rows = [], chain = config.chain.name) {
  // Lọc theo chain trước mọi phép tính. Phí trên Tempo tính bằng PathUSD, phí
  // trên Base là gas ETH được tài trợ — cộng chung hai thứ đó lại thì ra một
  // con số không có đơn vị và không có nghĩa.
  const mine = rows.filter((r) => r.chain === chain);

  const sales = mine.filter((r) => r.type === "revenue" && r.status === "settled");
  const withCost = sales.filter((r) => r.settlementCost != null);

  const revenue = sales.reduce((s, r) => s + Number(r.amountUsdc || 0), 0);
  const cost = withCost.reduce((s, r) => s + Number(r.settlementCost), 0);

  // Chi phí đo trực tiếp từ chính các lượt THU. Chính xác nhất, nhưng chỉ có
  // trên chain vừa thu phí bằng stablecoin vừa settle được qua x402.
  const fromSales = withCost.length ? cost / withCost.length : null;

  // Dự phòng: phí thật đã trả cho các lệnh chuyển tiền của agent TRÊN CÙNG
  // CHAIN. Một lượt settle x402 cũng là một lượt chuyển token, nên đây là ước
  // lượng sát — và là dữ liệu thật, không phải hằng số đoán.
  const fees = mine.filter((r) => r.executed && r.feeInToken != null).map((r) => Number(r.feeInToken));
  const fromTransfers = fees.length ? fees.reduce((a, b) => a + b, 0) / fees.length : null;

  return {
    chain,
    calls: sales.length,
    revenue: round6(revenue),
    settlementCost: round6(cost),
    grossProfit: round6(revenue - cost),
    costMeasured: withCost.length,
    costUnmeasured: sales.length - withCost.length,
    // Chi phí bình quân MỘT lượt bán, hoặc null nếu chưa từng đo được lượt nào.
    // null ở đây là câu trả lời đúng; 0 sẽ là lời nói dối tiện lợi.
    avgCostPerCall: fromSales == null ? null : round6(fromSales),

    // Con số dùng để định giá, kèm nguồn gốc của nó. Nguồn phải đi cùng số:
    // một ước lượng từ phí chuyển khoản không đáng tin bằng số đo từ chính
    // lượt thu, và người đọc sổ có quyền biết mình đang cầm loại nào.
    observedCost: round6OrNull(fromSales ?? fromTransfers),
    costSource: fromSales != null ? "settlement" : fromTransfers != null ? "transfer-fee" : null,
    feeSamples: withCost.length || fees.length,

    owed: mine.filter((r) => r.type === "revenue" && r.status === "owed").length,
  };
}

/**
 * Giá agent sẽ đòi cho lượt bán tiếp theo.
 *
 * Quy tắc: đủ bù chi phí đo được cộng biên yêu cầu, nhưng không vượt trần.
 *
 * Trần tồn tại vì lý do đối xứng với guard bên chi. Bên chi, agent không được
 * tự cho phép tiêu quá tay; bên thu, nó không được tự cho phép nâng giá vô hạn
 * khi chi phí tăng. Chạm trần thì DỪNG BÁN, không phải bán lỗ và cũng không
 * phải đòi giá cắt cổ — cả hai đều là cách hỏng, chỉ khác chiều.
 */
export function quote({
  configuredPrice = config.pricing.price,
  observedCost = null,
  minMargin = config.pricing.minMargin,
  maxPrice = config.pricing.maxPrice,
} = {}) {
  if (observedCost == null) {
    // Chưa đo được chi phí thì bán theo giá cấu hình, và nói rõ là chưa đo
    // được. Đoán một con số chi phí rồi định giá lên trên nó thì tệ hơn hẳn
    // việc thừa nhận mình chưa biết.
    return { price: configuredPrice, basis: "configured", observedCost: null, sell: true };
  }

  const floor = round6(observedCost * (1 + minMargin));
  const price = round6(Math.max(configuredPrice, floor));

  if (price > maxPrice) {
    return {
      price: null,
      basis: "refused",
      observedCost,
      floor,
      sell: false,
      why:
        `chi phí settle ${observedCost} đẩy giá sàn lên ${floor}, ` +
        `vượt trần ${maxPrice}. Không bán lỗ, cũng không nâng giá vô hạn.`,
    };
  }

  return {
    price,
    basis: price > configuredPrice ? "cost-plus" : "configured",
    observedCost,
    floor,
    sell: true,
  };
}

function round6(n) {
  return Number(Number(n).toFixed(6));
}

function round6OrNull(n) {
  return n == null ? null : round6(n);
}
