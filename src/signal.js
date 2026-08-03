// Tín hiệu fair-value cho prediction market ngắn hạn — thứ agent BÁN.
//
// Port từ dịch vụ đang chạy trên Arc, giữ nguyên cả bốn lỗi dữ liệu đã sửa:
// giá lấy từ CLOB chứ không phải Gamma bestBid/bestAsk (Gamma sai hẳn),
// giờ mở kỳ suy từ endDate trừ độ dài đọc trong tên market (eventStartTime
// KHÔNG phải giờ mở kỳ), map đúng chiều bid/ask, và kỳ chưa mở thì fair = 0.5.
// Bỏ phần cache theo isolate của Cloudflare — Node giữ trạng thái khác.

export const ASSETS = {
  Bitcoin: "BTCUSDT", Ethereum: "ETHUSDT", Solana: "SOLUSDT",
  XRP: "XRPUSDT", Dogecoin: "DOGEUSDT", BNB: "BNBUSDT",
};
const EDGE_THRESHOLD = 0.05; // 5 cents
const MIN_SECONDS_LEFT = 50; // below this the quote is stale before you can act

// Spot comes from Bybit, not Binance: Binance answers 403 to Cloudflare Worker
// egress IPs (both api.binance.com and the data mirror), while Bybit, Coinbase
// and Kraken all answer 200. Bybit is the closest match — same USDT pairs for
// every asset these markets cover.
//
// One call per symbol gives both the history and the price: Bybit returns the
// in-progress candle first, so its close is the live spot.
async function bybitCandles(symbol) {
  const u = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=1&limit=90`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`bybit ${symbol} -> ${r.status}`);
  const j = await r.json();
  const list = j?.result?.list;
  if (!Array.isArray(list) || !list.length) throw new Error(`bybit ${symbol} -> ${j?.retMsg || "no data"}`);
  // Bybit lists newest-first; we want oldest-first.
  return list
    .map((c) => ({ openTime: Number(c[0]), open: Number(c[1]), close: Number(c[4]) }))
    .sort((a, b) => a.openTime - b.openTime);
}

// The period this market covers, in minutes, read off the question text
// ("… - July 30, 11:15PM-11:20PM ET" -> 5).
//
// This has to come from the question. `eventStartTime` is NOT the period open:
// consecutive 11:15-11:20 and 11:20-11:25 markets carry the same value, so
// using it prices every period against the same stale candle.
function periodMinutes(q) {
  const m = (q || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  const to24 = (h, ap) => (Number(h) % 12) + (/pm/i.test(ap) ? 12 : 0);
  const a = to24(m[1], m[3]) * 60 + Number(m[2]);
  let b = to24(m[4], m[6]) * 60 + Number(m[5]);
  if (b <= a) b += 1440; // period crosses midnight
  return b - a;
}

// Abramowitz-Stegun 7.1.26 — enough precision for a pricing signal.
function normCdf(x) {
  const s = x < 0 ? -1 : 1, z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}

// Per-minute stdev of log returns over the candle closes.
function sigmaFrom(closes) {
  const r = [];
  for (let i = 1; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]));
  if (r.length < 2) return null;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
}

// Polymarket leaves hundreds of dead 2025 markets flagged closed=false, so
// sorting by endDate ascending never reaches today. end_date_min is what makes
// this query return live markets at all. We only look 30 minutes out — beyond
// that the market isn't short-dated enough for this model to say anything.
async function liveUpDownMarkets() {
  const now = new Date(), max = new Date(Date.now() + 1800e3);
  const u = "https://gamma-api.polymarket.com/markets?closed=false&active=true"
    + `&end_date_min=${now.toISOString()}&end_date_max=${max.toISOString()}`
    + "&order=endDate&ascending=true&limit=100";
  const r = await fetch(u);
  if (!r.ok) throw new Error(`gamma -> ${r.status}`);
  const all = await r.json();
  return (Array.isArray(all) ? all : []).filter((m) => /Up or Down/i.test(m.question || "") && m.clobTokenIds);
}

// Live order book, in one batched request.
//
// Gamma's `bestBid`/`bestAsk` fields cannot be used for this: measured against
// the book they are simply wrong (a market quoting 0.130/0.131 on the CLOB came
// back as 0.03/0.04 from Gamma), and `outcomePrices` lags. Pricing a signal off
// either would manufacture double-digit "edges" that do not exist. The CLOB is
// the only source that matches what a taker would actually get filled at.
async function clobPrices(markets) {
  const yesToken = new Map();
  const reqs = [];
  for (const m of markets) {
    let t;
    try { t = JSON.parse(m.clobTokenIds)[0]; } catch { continue; }
    if (!t) continue;
    yesToken.set(String(m.id), t);
    reqs.push({ token_id: t, side: "BUY" }, { token_id: t, side: "SELL" });
  }
  if (!reqs.length) return { yesToken, prices: {} };

  const r = await fetch("https://clob.polymarket.com/prices", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(reqs),
  });
  if (!r.ok) throw new Error(`clob -> ${r.status}`);
  return { yesToken, prices: await r.json() };
}

export async function fairValue() {
    const markets = await liveUpDownMarkets();
  const wanted = [...new Set(markets.map((m) => ASSETS[(m.question || "").split(" Up or Down")[0]]).filter(Boolean))];

  if (!wanted.length) {
    return {
      model: "lognormal zero-drift: P(close>open) = Phi(ln(spot/open)/(sigma*sqrt(t)))",
      markets: [], note: "No live Up/Down markets in the next 30 minutes.", generatedAt: new Date().toISOString(),
    };
  }

  const [book, ...candleSets] = await Promise.all([
    clobPrices(markets),
    ...wanted.map((s) => bybitCandles(s)),
  ]);

  const spot = {}, sigma = {}, candles = {};
  wanted.forEach((s, i) => {
    candles[s] = candleSets[i];
    spot[s] = candles[s][candles[s].length - 1].close; // in-progress candle = live price
    sigma[s] = sigmaFrom(candles[s].map((c) => c.close));
  });

  const now = Date.now();
  const rows = [];
  for (const m of markets) {
    const sym = ASSETS[(m.question || "").split(" Up or Down")[0]];
    if (!sym || !spot[sym] || !sigma[sym]) continue;

    const endMs = new Date(m.endDate).getTime();
    const durMin = periodMinutes(m.question);
    if (!durMin) continue;
    const startMs = endMs - durMin * 60000;
    const secondsLeft = Math.round((endMs - now) / 1000);
    const minutesLeft = (endMs - now) / 60000;
    if (!(minutesLeft > 0)) continue;

    // A period that hasn't opened yet has no reference price, so under a
    // zero-drift model its fair value is exactly 0.5 — pricing it off the latest
    // candle instead would invent an edge out of an open that doesn't exist.
    const pending = startMs > now;
    const c = pending ? null : candles[sym].filter((x) => x.openTime <= startMs).pop();
    if (!pending && !c) continue;

    const fair = pending ? 0.5 : normCdf(Math.log(spot[sym] / c.open) / (sigma[sym] * Math.sqrt(minutesLeft)));

    // The CLOB returns the best resting order on each side: side=BUY is the
    // best bid, side=SELL is the best ask. (Verified against a book quoting
    // 0.130 bid / 0.131 ask.)
    const px = book.prices[book.yesToken.get(String(m.id))] || {};
    const bid = Number(px.BUY), ask = Number(px.SELL);
    const edgeYes = Number.isFinite(ask) ? fair - ask : null;   // buy YES if the book is under the model
    const edgeNo = Number.isFinite(bid) ? bid - fair : null;    // buy NO if the book is over it

    let signal = "WAIT", edge = 0;
    if (secondsLeft >= MIN_SECONDS_LEFT) {
      if (edgeYes !== null && edgeYes >= EDGE_THRESHOLD) { signal = "BUY_YES"; edge = edgeYes; }
      else if (edgeNo !== null && edgeNo >= EDGE_THRESHOLD) { signal = "BUY_NO"; edge = edgeNo; }
      else edge = Math.max(edgeYes ?? -1, edgeNo ?? -1);
    }

    rows.push({
      market: m.question, id: String(m.id), asset: sym,
      status: pending ? "pending" : "live",
      periodOpen: c ? c.open : null, spot: Number(spot[sym].toFixed(8)),
      sigmaPerMin: Number(sigma[sym].toFixed(8)),
      minutesLeft: Number(minutesLeft.toFixed(2)), secondsLeft,
      fairValue: Number(fair.toFixed(4)),
      bestBid: Number.isFinite(bid) ? bid : null,
      bestAsk: Number.isFinite(ask) ? ask : null,
      edge: Number(edge.toFixed(4)), signal,
    });
  }

  rows.sort((a, b) => b.edge - a.edge);
  const body = {
    model: "lognormal zero-drift: P(close>open) = Phi(ln(spot/open)/(sigma*sqrt(t)))",
    sigmaEstimator: "stdev of the last 60-90 one-minute log returns",
    signalRule: `|edge| >= ${EDGE_THRESHOLD} and >= ${MIN_SECONDS_LEFT}s remaining`,
    sources: ["bybit:spot 1m klines", "polymarket:gamma (market discovery)", "polymarket:clob (live book)"],
    priceSource: "CLOB order book — Gamma's bestBid/bestAsk do not match the book and are not used",
    counts: { markets: rows.length, signals: rows.filter((r) => r.signal !== "WAIT").length },
    markets: rows,
    disclaimer: "Model output, not investment advice. A simple model runs roughly break-even against professional market makers.",
    generatedAt: new Date().toISOString(),
  };
  return body;
}

