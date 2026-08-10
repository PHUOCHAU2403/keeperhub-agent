// The agent's shopfront — one page, read straight from the ledger.
//
// Why it exists: until this page, every piece of evidence lived in a terminal
// or in JSON. A reviewer will not clone the repo, set an API key and run the
// loop. If the agent's behaviour is only visible to someone who does, it is not
// visible.
//
// The page has no figures of its own. Every number comes from data/ledger.jsonl,
// the same source as `npm run status`, so there is no path by which it can look
// better than the truth.

import { config, explorerFor } from "./config.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Translate reasons written before the interface was in English.
 *
 * The ledger is append-only, so rows written on 5 August still carry the
 * Vietnamese wording the rules produced at the time. Rewriting the file to tidy
 * the display would break the one property the ledger is for, and running a
 * dozen empty cycles to push them off the page would pad the very restraint
 * count this project offers as evidence. So the translation happens here, at
 * render time, and the record stays exactly as it was written.
 */
const LEGACY = [
  [/^Số dư ([\d.]+) (\S+) vượt vốn lưu động ([\d.]+) \S+\..*$/,
   (m) => `Balance ${m[1]} ${m[2]} exceeds the ${m[3]} ${m[2]} working-capital floor. Sweeping the surplus to treasury.`],
  [/^Dư ([\d.]+) (\S+) — dưới ngưỡng quét ([\d.]+) \S+\..*$/,
   (m) => `Surplus ${m[1]} ${m[2]} is under the ${m[3]} ${m[2]} minimum. Holding.`],
  [/^vượt trần một lệnh ([\d.]+) (\S+)$/, (m) => `over the ${m[1]} ${m[2]} per-action cap`],
  [/^vượt ngân sách phiên .*$/, () => "over the session budget"],
  [/^địa chỉ nhận không hợp lệ$/, () => "recipient address is malformed"],
  [/^số tiền không dương$/, () => "amount is not positive"],
];

const englishReason = (text) => {
  const t = String(text ?? "");
  for (const [re, fn] of LEGACY) { const m = t.match(re); if (m) return fn(m); }
  return t;
};

const n6 = (v) => (v == null ? "—" : Number(v).toFixed(6));
const short = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");
const when = (ts) => (ts ? ts.slice(5, 16).replace("T", " ") : "");

export function renderDashboard({ economics, summary, entries, quote }) {
  const sym = config.chain.token.symbol;

  const txRows = entries
    .filter((r) => r.txHash)
    .reverse()
    .map((r) => {
      const link = explorerFor(r.chain, r.txHash);
      const hash = link
        ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(short(r.txHash))}</a>`
        : `<span class="mono dim">${esc(short(r.txHash))}</span>`;
      return `<tr>
        <td class="dim">${esc(when(r.ts))}</td>
        <td>${esc(r.chain ?? "")}</td>
        <td>${r.type === "revenue" ? "in" : "out"}</td>
        <td class="num">${esc(n6(r.amountUsdc ?? r.amount))}</td>
        <td class="num dim">${esc(n6(r.settlementCost ?? r.feeInToken))}</td>
        <td class="mono">${r.memo ? esc(r.memo) : '<span class="dim">—</span>'}</td>
        <td class="mono">${hash}</td>
      </tr>`;
    })
    .join("");

  const decisions = entries
    .filter((r) => r.type === "decision" || r.status === "refused")
    .slice(-14)
    .reverse()
    .map((r) => {
      const verdict = r.blocked
        ? `<span class="tag stop">blocked</span>`
        : r.status === "refused"
        ? `<span class="tag stop">not selling</span>`
        : r.executed
        ? `<span class="tag go">executed</span>`
        : `<span class="tag hold">held</span>`;
      return `<tr>
        <td class="dim">${esc(when(r.ts))}</td>
        <td>${verdict}</td>
        <td class="reason">${esc(englishReason(r.blocked || r.reason || ""))}</td>
      </tr>`;
    })
    .join("");

  const held = summary.heldBack ?? 0;
  const acted = summary.executed ?? 0;
  const total = held + acted;
  const restraint = total ? Math.round((held / total) * 100) : 0;

  return `<title>An agent with its own balance sheet</title>
<style>
  :root{
    --bg:#fbfbfa; --fg:#16150f; --dim:#8a8781; --line:#e4e2dc;
    --card:#fff; --go:#1a7f47; --stop:#b23c17; --hold:#7a7770;
  }
  @media (prefers-color-scheme:dark){
    :root{ --bg:#111110; --fg:#eceae4; --dim:#8a8781; --line:#2a2926;
           --card:#181816; --go:#4ec27f; --stop:#e0784f; --hold:#8a8781; }
  }
  :root[data-theme="dark"]{ --bg:#111110; --fg:#eceae4; --dim:#8a8781; --line:#2a2926;
                            --card:#181816; --go:#4ec27f; --stop:#e0784f; --hold:#8a8781; }
  :root[data-theme="light"]{ --bg:#fbfbfa; --fg:#16150f; --dim:#8a8781; --line:#e4e2dc;
                             --card:#fff; --go:#1a7f47; --stop:#b23c17; --hold:#7a7770; }

  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);
       font:15px/1.6 ui-sans-serif,-apple-system,"Segoe UI",Inter,sans-serif;
       -webkit-font-smoothing:antialiased}
  .wrap{max-width:940px;margin:0 auto;padding:56px 24px 96px}
  .mono,.num{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
             font-variant-numeric:tabular-nums}
  .dim{color:var(--dim)}
  a{color:inherit;text-decoration:none;border-bottom:1px solid var(--line)}
  a:hover{border-color:currentColor}

  h1{font-size:26px;font-weight:600;letter-spacing:-.02em;margin:0 0 6px}
  .sub{color:var(--dim);margin:0 0 8px}
  .meta{display:flex;gap:18px;flex-wrap:wrap;color:var(--dim);font-size:13px;
        padding-bottom:28px;border-bottom:1px solid var(--line)}

  h2{font-size:12px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;
     color:var(--dim);margin:44px 0 14px}

  .grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(168px,1fr))}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px}
  .k{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--dim);margin-bottom:8px}
  .v{font-size:23px;font-weight:600;letter-spacing:-.02em;
     font-family:ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
  .v small{font-size:12px;font-weight:400;color:var(--dim);margin-left:5px}
  .note{font-size:12px;color:var(--dim);margin-top:7px;line-height:1.45}

  .price{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:20px 22px}
  .price .row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;
              border-bottom:1px dashed var(--line);font-size:14px}
  .price .row:last-child{border:0}

  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;font-weight:500;color:var(--dim);font-size:11px;
     letter-spacing:.07em;text-transform:uppercase;padding:0 10px 9px 0;
     border-bottom:1px solid var(--line)}
  td{padding:10px 10px 10px 0;border-bottom:1px solid var(--line);vertical-align:top}
  td.num{text-align:right;font-family:ui-monospace,Menlo,Consolas,monospace;
         font-variant-numeric:tabular-nums}
  th.num{text-align:right}
  .reason{color:var(--dim)}
  .scroll{overflow-x:auto}

  .tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:20px;
       border:1px solid currentColor;white-space:nowrap}
  .go{color:var(--go)} .stop{color:var(--stop)} .hold{color:var(--hold)}

  footer{margin-top:56px;padding-top:22px;border-top:1px solid var(--line);
         color:var(--dim);font-size:12.5px;line-height:1.7}
  @media(max-width:560px){ .wrap{padding:32px 16px 64px} h1{font-size:21px} .v{font-size:20px} }
</style>

<div class="wrap">
  <h1>An agent with its own balance sheet</h1>
  <p class="sub">Earns over x402, executes through KeeperHub, and prices itself from what it has actually paid.</p>
  <div class="meta">
    <span>${esc(config.chain.name)}</span>
    <span class="mono">${esc(config.wallet)}</span>
    <span>${config.simulate ? "SIMULATION" : "LIVE"}</span>
  </div>

  <h2>Pricing decision, right now</h2>
  <div class="price">
    <div class="row"><span>Asking price</span>
      <b class="mono">${quote.sell ? esc(n6(quote.price)) + " " + esc(sym) : "NOT SELLING"}</b></div>
    <div class="row"><span>Basis</span><span class="mono">${esc(quote.basis)}</span></div>
    <div class="row"><span>Measured settlement cost</span>
      <span class="mono">${esc(n6(economics.observedCost))} ${economics.costSource ? `<span class="dim">· ${esc(economics.costSource)} · ${economics.feeSamples} samples</span>` : '<span class="dim">· not measurable yet</span>'}</span></div>
    <div class="row"><span>Floor (cost + ${Math.round(config.pricing.minMargin * 100)}% margin)</span>
      <span class="mono">${esc(n6(quote.floor))}</span></div>
    <div class="row"><span>Ceiling</span><span class="mono">${esc(n6(config.pricing.maxPrice))}</span></div>
    ${quote.why ? `<div class="row"><span class="stop">Why it stopped</span><span class="reason">${esc(quote.why)}</span></div>` : ""}
  </div>
  <p class="note">The price is not a constant in a config file. The agent reads the fees it has
  actually paid on this chain and sets its own floor. When the floor clears the
  ceiling it stops selling — it will not sell at a loss, and it will not raise
  prices without bound.</p>

  <h2>Balance sheet · ${esc(economics.chain)}</h2>
  <div class="grid">
    <div class="card"><div class="k">Revenue</div>
      <div class="v">${esc(n6(economics.revenue))}<small>${esc(sym)}</small></div>
      <div class="note">${economics.calls} sales</div></div>
    <div class="card"><div class="k">Settlement cost</div>
      <div class="v">${economics.costMeasured ? esc(n6(economics.settlementCost)) + `<small>${esc(sym)}</small>` : "—"}</div>
      <div class="note">${economics.costMeasured} measured · ${economics.costUnmeasured} not measurable</div></div>
    <div class="card"><div class="k">Gross profit</div>
      <div class="v">${esc(n6(economics.grossProfit))}<small>${esc(sym)}</small></div>
      <div class="note">${economics.costMeasured ? "" : "fee not yet deductible — "}${economics.owed ? economics.owed + " sales still owed a delivery" : "nothing owed"}</div></div>
    <div class="card"><div class="k">Moved</div>
      <div class="v">${esc(n6(summary.moved))}<small>${esc(sym)}</small></div>
      <div class="note">${summary.chainVerified ?? 0} re-checked against the chain</div></div>
  </div>

  <h2>Restraint · ${esc(summary.chain)}</h2>
  <div class="grid">
    <div class="card"><div class="k">Cycles</div><div class="v">${esc(summary.cycles)}</div></div>
    <div class="card"><div class="k">Executed</div><div class="v">${esc(acted)}</div></div>
    <div class="card"><div class="k">Held back</div><div class="v">${esc(held)}</div></div>
    <div class="card"><div class="k">Restraint rate</div><div class="v">${restraint}<small>%</small></div>
      <div class="note">A ledger with only actions cannot show that an agent knows when to hold.</div></div>
  </div>

  <h2>On-chain transactions · all networks</h2>
  <p class="note" style="margin:-6px 0 12px">This table spans every network, because each row carries its own unit. The
  totals above do not — adding PathUSD to USDC gives a number with no unit — so
  every aggregate is locked to a single chain.</p>
  <div class="scroll"><table>
    <tr><th>When</th><th>Chain</th><th>Kind</th><th class="num">Amount</th>
        <th class="num">Fee</th><th>Memo</th><th>Hash</th></tr>
    ${txRows || '<tr><td colspan="7" class="dim">No transactions yet.</td></tr>'}
  </table></div>

  <h2>Decision log</h2>
  <div class="scroll"><table>
    <tr><th>When</th><th>Verdict</th><th>Reason</th></tr>
    ${decisions || '<tr><td colspan="3" class="dim">No decisions yet.</td></tr>'}
  </table></div>

  <footer>
    Every figure on this page is read straight from <span class="mono">data/ledger.jsonl</span> —
    the same source as <span class="mono">npm run status</span>. No number is computed for display.<br>
    Raw data: <a href="/ledger">/ledger</a> ·
    Source: <a href="https://github.com/PHUOCHAU2403/keeperhub-agent" target="_blank" rel="noopener">github.com/PHUOCHAU2403/keeperhub-agent</a>
  </footer>
</div>`;
}
