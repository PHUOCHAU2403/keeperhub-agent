// Cấu hình agent. Mọi ngưỡng nằm ở đây, không rải trong logic.

const CHAINS = {
  "base-sepolia": {
    id: 84532,
    name: "Base Sepolia",
    token: { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", symbol: "USDC", decimals: 6 },
    explorer: "https://sepolia.basescan.org/tx/",
    rpc: "https://sepolia.base.org",
    memo: false,
  },
  base: {
    id: 8453,
    name: "Base",
    token: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6 },
    explorer: "https://basescan.org/tx/",
    rpc: "https://mainnet.base.org",
    memo: false,
  },

  // Tempo Moderato — testnet của chain thanh toán do Stripe/Paradigm làm.
  //
  // Hai điểm khác Base, cả hai đều đã kiểm chứng bằng receipt của giao dịch
  // 0x58a99c37…e7702 đọc thẳng từ RPC:
  //
  //   1. Không có token native. PHÍ TRẢ BẰNG CHÍNH STABLECOIN ĐANG CHUYỂN —
  //      nó hiện ra như một Transfer ERC-20 nữa về `feeCollector` trong cùng
  //      receipt. Nên chi phí và doanh thu cùng đơn vị: bảng cân đối của agent
  //      khép lại được mà không cần quy đổi tỷ giá.
  //   2. Ví agent tự đứng tên `from`, không qua relayer như bên Base.
  //
  // Explorer testnet nằm ở HOST RIÊNG, không phải tham số mạng trên host chính,
  // và đường dẫn là /receipt/ chứ không phải /tx/ như các chain EVM khác. Cả
  // hai đều hợp lý khi đã biết — Tempo coi một khoản thanh toán là tờ biên
  // nhận, có memo in ngay trên đó và xuất được PDF — nhưng không đoán ra được.
  "tempo-moderato": {
    id: 42431,
    name: "Tempo Moderato",
    token: { address: "0x20c0000000000000000000000000000000000000", symbol: "PathUSD", decimals: 6 },
    explorer: "https://explore.testnet.tempo.xyz/receipt/",
    rpc: process.env.TEMPO_RPC || "https://rpc.moderato.tempo.xyz",
    memo: true,
    feeCollector: "0xfeec000000000000000000000000000000000000",
  },
};

const chainKey = process.env.CHAIN || "base-sepolia";
if (!CHAINS[chainKey]) {
  throw new Error(`CHAIN không hợp lệ: ${chainKey}. Chọn: ${Object.keys(CHAINS).join(", ")}`);
}

export const config = {
  chain: CHAINS[chainKey],

  api: {
    base: process.env.KEEPERHUB_API || "https://app.keeperhub.com/api",
    key: process.env.KEEPERHUB_API_KEY || "",
  },

  // Ví Turnkey của agent — nơi doanh thu chảy vào và mọi lệnh phát đi từ đó.
  wallet: process.env.AGENT_WALLET || "0x3dC7e1Cf08299Ba8ad3B0DeA271C0b58F51EC193",

  // Nơi quét doanh thu dư về. Mặc định trỏ về chính ví agent để chạy thử an
  // toàn — đặt TREASURY trong .env khi muốn quét thật đi nơi khác.
  treasury: process.env.TREASURY || process.env.AGENT_WALLET || "0x3dC7e1Cf08299Ba8ad3B0DeA271C0b58F51EC193",

  rules: {
    // Giữ lại chừng này làm vốn lưu động, phần vượt mới quét.
    sweepFloor: Number(process.env.SWEEP_FLOOR ?? 5),
    // Dưới mức này thì không quét — tránh phát giao dịch cho vài xu lẻ.
    sweepMin: Number(process.env.SWEEP_MIN ?? 1),
  },

  guards: {
    // Trần tuyệt đối cho MỘT lệnh. Agent không bao giờ chuyển quá số này.
    maxPerAction: Number(process.env.MAX_PER_ACTION ?? 50),
    // Tổng đã chi trong phiên. Chạm trần là dừng, không phải cảnh báo.
    sessionBudget: Number(process.env.SESSION_BUDGET ?? 200),
  },

  // Bên THU. Đối xứng với guards bên chi: một trần trên và một sàn dưới, và
  // chạm giới hạn thì dừng chứ không nới.
  pricing: {
    // Giá niêm yết. Chỉ là điểm khởi đầu — chi phí đo được có thể đẩy nó lên.
    price: Number(process.env.SIGNAL_PRICE ?? 0.01),
    // Biên tối thiểu trên chi phí settle. 0.5 = đòi lãi gộp 50%.
    minMargin: Number(process.env.MIN_MARGIN ?? 0.5),
    // Trần giá. Chi phí đẩy giá sàn vượt mức này thì NGỪNG BÁN.
    maxPrice: Number(process.env.MAX_PRICE ?? 0.05),
  },

  // Chạy toàn bộ vòng lặp mà KHÔNG phát giao dịch lên chain.
  //
  // Mặc định BẬT — phát tiền thật phải là hành động cố ý. Tắt bằng cờ `--live`
  // (chạy được ở mọi shell) hoặc SIMULATE=0. Dùng cờ vì cú pháp đặt biến môi
  // trường trước lệnh chỉ đúng với bash, không đúng với PowerShell.
  simulate: !(process.argv.includes("--live") || process.env.SIMULATE === "0"),

  intervalMs: Number(process.env.INTERVAL_MS ?? 60_000),
  ledgerPath: process.env.LEDGER || "data/ledger.jsonl",
};

/**
 * Định dạng tiền kèm ký hiệu CỦA CHAIN ĐANG CHẠY.
 *
 * Trước đây hàm này hardcode "USDC". Trên Tempo thì token là PathUSD, nên log
 * sẽ nói dối về thứ agent vừa chuyển. Sổ sách của một agent cầm tiền không được
 * phép ghi sai tên đồng tiền, kể cả ở dòng log.
 */
export const money = (n) => `${Number(n).toFixed(6)} ${config.chain.token.symbol}`;

/** Đổi số người đọc được sang đơn vị nhỏ nhất của token. */
export const units = (n) =>
  BigInt(Math.round(Number(n) * 10 ** config.chain.token.decimals)).toString();

/** Đổi ngược lại — dùng khi đọc số dư và phí từ chain. */
export const fromUnits = (raw) => Number(BigInt(raw)) / 10 ** config.chain.token.decimals;

/**
 * Link explorer cho một giao dịch, tra theo TÊN CHAIN ghi trong sổ cái.
 *
 * Sổ cái chứa nhiều chain, nên không dùng được config.chain hiện tại — một dòng
 * Base cũ mà ghép với explorer Tempo thì ra link chết trỏ sai mạng.
 */
export function explorerFor(chainName, txHash) {
  const c = Object.values(CHAINS).find((x) => x.name === chainName);
  return c?.explorer && txHash ? c.explorer + txHash : null;
}
