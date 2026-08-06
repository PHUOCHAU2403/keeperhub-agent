// Mặt tiền của agent — một trang đọc thẳng sổ cái.
//
// Lý do tồn tại: mọi bằng chứng của dự án này đến giờ đều nằm trong terminal
// hoặc trong JSON. Người đánh giá sẽ không clone repo, không đặt API key, và
// không chạy vòng lặp. Nếu phải chạy code mới thấy được agent làm gì thì coi
// như không thấy.
//
// Trang này KHÔNG có số liệu riêng. Mọi con số đều đọc từ data/ledger.jsonl —
// cùng nguồn với `npm run status`. Không có đường nào để nó đẹp hơn sự thật.

import { config, explorerFor } from "./config.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
        <td>${r.type === "revenue" ? "thu" : "chi"}</td>
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
        ? `<span class="tag stop">chặn</span>`
        : r.status === "refused"
        ? `<span class="tag stop">ngừng bán</span>`
        : r.executed
        ? `<span class="tag go">đã thực thi</span>`
        : `<span class="tag hold">giữ</span>`;
      return `<tr>
        <td class="dim">${esc(when(r.ts))}</td>
        <td>${verdict}</td>
        <td class="reason">${esc(r.blocked || r.reason || "")}</td>
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
    <span>${config.simulate ? "MÔ PHỎNG" : "THẬT"}</span>
  </div>

  <h2>Quyết định giá lúc này</h2>
  <div class="price">
    <div class="row"><span>Giá đang đòi</span>
      <b class="mono">${quote.sell ? esc(n6(quote.price)) + " " + esc(sym) : "NGỪNG BÁN"}</b></div>
    <div class="row"><span>Căn cứ</span><span class="mono">${esc(quote.basis)}</span></div>
    <div class="row"><span>Chi phí settle đo được</span>
      <span class="mono">${esc(n6(economics.observedCost))} ${economics.costSource ? `<span class="dim">· ${esc(economics.costSource)} · ${economics.feeSamples} mẫu</span>` : '<span class="dim">· chưa đo được</span>'}</span></div>
    <div class="row"><span>Giá sàn (vốn + biên ${Math.round(config.pricing.minMargin * 100)}%)</span>
      <span class="mono">${esc(n6(quote.floor))}</span></div>
    <div class="row"><span>Trần</span><span class="mono">${esc(n6(config.pricing.maxPrice))}</span></div>
    ${quote.why ? `<div class="row"><span class="stop">Lý do dừng</span><span class="reason">${esc(quote.why)}</span></div>` : ""}
  </div>
  <p class="note">Giá không phải hằng số trong cấu hình. Agent đọc phí nó đã thật sự trả trên chain
  này rồi tự đặt sàn. Chạm trần thì dừng bán — không bán lỗ, cũng không nâng giá vô hạn.</p>

  <h2>Bảng cân đối · ${esc(economics.chain)}</h2>
  <div class="grid">
    <div class="card"><div class="k">Doanh thu</div>
      <div class="v">${esc(n6(economics.revenue))}<small>${esc(sym)}</small></div>
      <div class="note">${economics.calls} lượt bán</div></div>
    <div class="card"><div class="k">Chi phí settle</div>
      <div class="v">${economics.costMeasured ? esc(n6(economics.settlementCost)) + `<small>${esc(sym)}</small>` : "—"}</div>
      <div class="note">${economics.costMeasured} đo được · ${economics.costUnmeasured} không đo được</div></div>
    <div class="card"><div class="k">Lãi gộp</div>
      <div class="v">${esc(n6(economics.grossProfit))}<small>${esc(sym)}</small></div>
      <div class="note">${economics.costMeasured ? "" : "chưa trừ được phí — "}${economics.owed ? economics.owed + " lượt còn nợ hàng" : "không nợ hàng ai"}</div></div>
    <div class="card"><div class="k">Đã chuyển</div>
      <div class="v">${esc(n6(summary.moved))}<small>${esc(sym)}</small></div>
      <div class="note">${summary.chainVerified ?? 0} lượt đã đối chiếu lại với chain</div></div>
  </div>

  <h2>Kiềm chế · ${esc(summary.chain)}</h2>
  <div class="grid">
    <div class="card"><div class="k">Chu kỳ</div><div class="v">${esc(summary.cycles)}</div></div>
    <div class="card"><div class="k">Đã thực thi</div><div class="v">${esc(acted)}</div></div>
    <div class="card"><div class="k">Đã kiềm lại</div><div class="v">${esc(held)}</div></div>
    <div class="card"><div class="k">Tỷ lệ kiềm chế</div><div class="v">${restraint}<small>%</small></div>
      <div class="note">Sổ chỉ có hành động thì không chứng minh được agent biết dừng.</div></div>
  </div>

  <h2>Giao dịch trên chain · mọi mạng</h2>
  <p class="note" style="margin:-6px 0 12px">Bảng này liệt kê cả các mạng khác, vì mỗi dòng
  tự mang đơn vị của nó. Các ô tổng phía trên thì không — cộng PathUSD với USDC ra một số
  không có đơn vị, nên mọi con số tổng đều bị khoá theo đúng một chain.</p>
  <div class="scroll"><table>
    <tr><th>Lúc</th><th>Chain</th><th>Loại</th><th class="num">Số tiền</th>
        <th class="num">Phí</th><th>Memo</th><th>Hash</th></tr>
    ${txRows || '<tr><td colspan="7" class="dim">Chưa có giao dịch nào.</td></tr>'}
  </table></div>

  <h2>Nhật ký quyết định</h2>
  <div class="scroll"><table>
    <tr><th>Lúc</th><th>Kết luận</th><th>Lý do</th></tr>
    ${decisions || '<tr><td colspan="3" class="dim">Chưa có quyết định nào.</td></tr>'}
  </table></div>

  <footer>
    Mọi con số trên trang này đọc thẳng từ <span class="mono">data/ledger.jsonl</span> —
    cùng nguồn với <span class="mono">npm run status</span>. Không có số liệu nào được
    tính riêng cho trang hiển thị.<br>
    Dữ liệu thô: <a href="/ledger">/ledger</a> ·
    Mã nguồn: <a href="https://github.com/PHUOCHAU2403/keeperhub-agent" target="_blank" rel="noopener">github.com/PHUOCHAU2403/keeperhub-agent</a>
  </footer>
</div>`;
}
