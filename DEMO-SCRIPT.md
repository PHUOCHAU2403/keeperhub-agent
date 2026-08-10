# Kịch bản quay video demo — KeeperHub BUIDL

**Mục tiêu 2 phút 25.** Năm cảnh, **một trình duyệt duy nhất**, không dòng lệnh nào.
Lời thoại đưa qua TTS như các video trước — không cần tự đọc.

---

## Chuẩn bị (5 phút, làm trước khi bấm ghi)

**Mở hai tab, đúng thứ tự:**

1. `http://185.214.134.114:4182` — dashboard
2. `https://explore.testnet.tempo.xyz/receipt/0x73cd35ddd4f2c6b3785aadaf2715884d2c0209b13aa7b6602ce040ed23173973`
   — mở sẵn để cảnh 4 chuyển tab không phải chờ tải

**Trình duyệt:** ẩn thanh bookmark, đóng hết tab thừa, tắt thông báo, phóng to
**110–125%** cho chữ đọc được ở 1080p.

**Quay 1920×1080.** Cuộn bằng bánh xe chậm, đừng kéo thanh trượt — kéo thanh
trượt lên video trông giật.

**Chạy thử một lượt trước khi ghi.** Biết trước mỗi cảnh cuộn tới đâu thì lúc
ghi không phải dò.

---

## Cảnh 1 — Vấn đề (0:00 – 0:25)

**Hình:** đầu trang, đứng yên. Thấy tiêu đề, chain, địa chỉ ví.

**Lời:**
> Autonomous agents can already pay for things. What almost none of them can do
> is tell whether the payment was worth making.
>
> An agent that writes down its revenue and its fees has a diary. An agent that
> reads those numbers before it acts has a balance sheet. This is the second
> kind.

---

## Cảnh 2 — Nó biết chi phí của chính nó (0:25 – 0:58)

**Hình:** cuộn xuống khối **Pricing decision, right now**. Dừng để thấy đủ năm
dòng: Asking price · Basis · Measured settlement cost · Floor · Ceiling.

**Lời:**
> This is the price it is asking right now, and none of it comes from a config
> file. It reads the fees it has actually paid on this chain, adds a required
> margin, and that becomes the floor.
>
> There is a ceiling as well. If costs rise far enough that the floor would
> clear it, the agent stops selling. Selling at a loss and gouging are the same
> failure from opposite ends, so it has a brake on both.

**Ghi chú:** con trỏ rê chậm qua dòng **Floor** rồi dừng ở **Ceiling** — cho mắt
người xem bám theo lập luận.

---

## Cảnh 3 — Nó biết từ chối chính nó (0:58 – 1:32)

**Hình:** cuộn tới khối **RESTRAINT**. Dừng ở ô **83%**, rồi cuộn tiếp một nhịp
để lộ câu ngay bên dưới.

**Lời:**
> Six cycles, one action, five times it decided to do nothing — and it wrote
> down why each time.
>
> A ledger with only actions cannot show that an agent knows when to hold. And
> holding is the harder behaviour.

**Hình (nối tiếp):** cuộn xuống **DECISION LOG**, dừng ở dòng
`blocked · over the 50.000000 PathUSD per-action cap`.

**Lời:**
> Here it wanted to move a large balance and its own guard stopped it. The rule
> asked; the guard refused. That separation is deliberate, and it is checked
> before any request goes out, never after.

---

## Cảnh 4 — Nó có thật (1:32 – 2:08)

**Hình:** cuộn tới bảng **ON-CHAIN TRANSACTIONS**. Dừng 2 giây cho thấy cột
`MEMO` và `FEE`. **Bấm vào hash `0x73cd35dd…`** → sang tab biên nhận Tempo.

**Lời:**
> Every row here is a real transaction, and every hash opens the public record.
>
> This one is on Tempo. The memo the agent generated is printed as a field on
> the receipt, and the fee — twenty-one millionths of a PathUSD — is charged in
> the same stablecoin that moved. Cost and revenue share a unit, so the books
> close without a currency conversion. That is what lets the agent price itself
> at all.

**Ghi chú:** trên trang biên nhận, rê chuột dừng ở dòng
`Memo: SWEEP-0001-20260805` khoảng 2 giây.

---

## Cảnh 5 — Kết (2:08 – 2:25)

**Hình:** quay lại tab dashboard, cuộn xuống **footer**.

**Lời:**
> Every figure on this page is read straight from the agent's own ledger — the
> same file its status command prints. Nothing here is computed for display.
>
> It earns over x402, executes through KeeperHub, and it knows what it costs.

**Overlay chữ ở cảnh cuối:**
```
185.214.134.114:4182
github.com/PHUOCHAU2403/keeperhub-agent
```

---

## Một chỗ phải nói thật, đừng giấu

Đầu trang có chữ **SIMULATION**. Đó là chế độ mặc định của vòng lặp — phát lệnh
thật phải bật cờ `--live` một cách cố ý.

**Đừng tắt nó đi để trang trông "live" hơn.** Nếu giám khảo hỏi mà không thấy
lời giải thích, cái mất lớn hơn nhiều so với cái được. Chèn một câu vào cảnh 4:

> The loop defaults to simulation — going live takes a deliberate flag. The
> transactions in this table were executed live.

Đó là sự thật, và nói ra làm bài mạnh lên chứ không yếu đi.

---

## Những gì cố ý KHÔNG quay

- **Không terminal.** Đây chính là lý do bản kịch bản trước bị bỏ: terminal chỉ
  đọc được với người đã viết code.
- **Không sơ đồ kiến trúc.** Hộp-và-mũi-tên ai vẽ cũng được, không chứng minh gì.
- **Không nói về tương lai.** Chỉ nói thứ đang chạy.
- **Không nhắc bounty onboarding.** Đó là bài nộp riêng, video riêng.

## Bảng kiểm trước khi nộp

- [ ] Video ≤ 2:40, YouTube **Unlisted**
- [ ] Xem lại trên điện thoại — chữ trong bảng có đọc được không
- [ ] Link video → ô **Demo video**
- [ ] `http://185.214.134.114:4182` → ô **Project website**
- [ ] `https://github.com/PHUOCHAU2403/keeperhub-agent` → ô **GitHub**
- [ ] Logo `buidl-logo.png` đã tải lên
- [ ] Vision (207 ký tự) đã dán
- [ ] Category **Crypto / Web3**
