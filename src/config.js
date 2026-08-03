// Cấu hình agent. Mọi ngưỡng nằm ở đây, không rải trong logic.

const CHAINS = {
  "base-sepolia": {
    id: 84532,
    name: "Base Sepolia",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    explorer: "https://sepolia.basescan.org",
  },
  base: {
    id: 8453,
    name: "Base",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    explorer: "https://basescan.org",
  },
};

const chainKey = process.env.CHAIN || "base-sepolia";
if (!CHAINS[chainKey]) throw new Error(`CHAIN không hợp lệ: ${chainKey}`);

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
    // Giữ lại chừng này USDC làm vốn lưu động, phần vượt mới quét.
    sweepFloorUsdc: Number(process.env.SWEEP_FLOOR ?? 5),
    // Dưới mức này thì không quét — tránh phát giao dịch cho vài xu lẻ.
    sweepMinUsdc: Number(process.env.SWEEP_MIN ?? 1),
  },

  guards: {
    // Trần tuyệt đối cho MỘT lệnh. Agent không bao giờ chuyển quá số này.
    maxPerActionUsdc: Number(process.env.MAX_PER_ACTION ?? 50),
    // Tổng đã chi trong phiên. Chạm trần là dừng, không phải cảnh báo.
    sessionBudgetUsdc: Number(process.env.SESSION_BUDGET ?? 200),
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

export const usdc = (n) => `${Number(n).toFixed(6)} USDC`;
