# BUIDL giải chính — nội dung cắt sẵn theo từng ô

KeeperHub Agents Onchain Hackathon · hạn 13/8/2026 17:00 giờ VN
Giải chính $2.000 / $1.200 / $800. Bài bounty riêng ở [BOUNTY-onboarding.md](BOUNTY-onboarding.md).

Mọi con số dưới đây kiểm chứng được. Không câu nào chưa xác minh.

---

## BUIDL name

```
An agent with its own balance sheet
```

## Tagline

```
It earns over x402, executes through KeeperHub, and prices itself from what it
has actually paid. Seven real transactions across four chains, one on mainnet.
```

## Description

```
Most agents in this space detect something and message a human. This one runs a
business: it sells a service, collects the money, pays its own costs, and uses
its own books to decide what to do next.

That last part is the whole point. An agent that logs its revenue and its fees
has a diary. An agent that reads those numbers before it acts has a balance
sheet — and this one refuses to sell below its measured cost.


WHAT IT DOES

The loop is: sense → decide → guard → execute → confirm → record.

Revenue comes in over x402. A buyer hits GET /signal, receives 402 Payment
Required, signs an EIP-3009 authorisation, and retries. The service settles that
authorisation by calling transferWithAuthorization THROUGH KEEPERHUB, then
serves the data. So KeeperHub is the execution layer on the money-in side, not
only the money-out side.

Outgoing actions — sweeping surplus to treasury, paying costs — also execute
through KeeperHub, with an idempotency key derived from the intent so a network
retry cannot pay twice.

Between the two sits the part that makes it an agent rather than a script: it
reads its own ledger, computes what a settlement has actually cost it on this
chain, and sets its price at cost plus a required margin. If costs rise far
enough that the floor would clear its own ceiling, it stops selling.


WHY THERE IS A CEILING AS WELL AS A FLOOR

On the spend side the agent may not let itself overspend: a hard per-action cap
and a session budget, both checked before the API call, never after. On the
revenue side it may not let itself raise prices without bound as costs climb.
Hitting either limit stops the action.

Selling at a loss and gouging are the same failure seen from opposite ends, and
an autonomous agent needs a brake on both. A rule can want to move 995 USDC; the
guard is what stops it, and the test suite asserts that separation explicitly.


THREE THINGS THE BUILD TAUGHT ME, IN ORDER

1. Gas sponsorship deleted a subsystem.

The first design had the agent hold ETH, watch its gas balance, and swap
USDC→ETH when it ran low. Then a zero-value transfer went through on Base
MAINNET from a wallet holding no ETH at all, with sponsored: true. The swap
path, the gas balance check and the second-token accounting all came out.
Verified first, then built — not the other way round.

  Base mainnet  0xac06f259f897ac1213f654acc5e78246ef1c95b65bf5cf468d95b3a83f9a7221

2. On Tempo the fee is denominated in the money being moved.

Tempo has no native token, so a transfer's fee is charged in the same stablecoin
and lands as an extra ERC-20 Transfer inside the same receipt. Cost and revenue
therefore share a unit and the books close without a conversion step. On Base
the fee is gas in ETH — a different asset, sponsored, invisible to the agent.

That is not a footnote. It is the reason the agent can price itself at all: it
reads its own cost from the receipt in the same unit as its revenue.

TIP-20 also adds transferWithMemo, with the memo as an INDEXED event parameter,
so a payment carries its own reconciliation reference. The agent writes a
readable one — SWEEP-0001-20260805 — rather than a hash, because a hash only
reconciles for someone already holding the lookup table.

  Tempo Moderato  0x73cd35ddd4f2c6b3785aadaf2715884d2c0209b13aa7b6602ce040ed23173973

3. The executor should not also be the only witness.

After every live execution the agent re-reads the receipt from a public RPC
rather than trusting the API's own report. This is not distrust of KeeperHub —
it is that one party should not be both the actor and the sole witness.

The very first transaction taught it: the API reported success while the receipt
showed an unfamiliar sender and value: 0. The API was right. I only knew that
after going to the chain myself, and that experience became four of the seven
onboarding findings I sent the team.


HONESTY IN THE LEDGER

The ledger records the cycles where the agent decided to do NOTHING, with the
reason. A ledger containing only actions cannot show that an agent knows when to
hold, and holding is the harder behaviour. A typical run: 11 cycles, 2 executed,
9 held back.

It also keeps "not measurable" separate from "zero". On Base the fee is
sponsored gas in another asset, so the agent cannot state a number — and writing
0 there would make the balance sheet assert something it does not know.


PROVEN ONCHAIN

  Ethereum Sepolia   0x17bca839d48b87667c263e1b7bafc8c301320c3ece556129ba305d6c1418703e
  Base Sepolia       0x9ed76e1639a26cc72f72305b7452463cc40ca7d826463b49c2941b52b49e35ed
  Base mainnet       0xac06f259f897ac1213f654acc5e78246ef1c95b65bf5cf468d95b3a83f9a7221
  First sweep        0x3a5a7332bc47da464c62d5710f817c6dfdba6a11253b4ae28a6d7a292d8aabbc
  x402 settlement    0x3d182c31dd9b9c678f782c7b664d718ea945f9ca3b70a2aa95a2ce05d6485413
  TIP-20 with memo   0x58a99c37cba90ff1cd37ac161000f6f63ed3ca1feea9fc3ff3797e73e06e7702
  Sweep with memo    0x73cd35ddd4f2c6b3785aadaf2715884d2c0209b13aa7b6602ce040ed23173973

Every one was read back from a public node, not taken from the API response.


KEEPERHUB SURFACES USED

  MCP server        discovery and the first transactions, scope user
  REST API          the 24/7 loop: /execute/transfer, /execute/contract-call,
                    /execute/{id}/status, Idempotency-Key, simulate
  x402              the selling side, settled through KeeperHub
  Gas sponsorship   verified working on Base mainnet from an empty wallet
  Audit trail       execution ids recorded against every ledger row


BUILT WITH

Node, no framework. 41 tests that touch no network, so every money decision is
provable offline — by the time you learn the behaviour from a live API call it
is already too late. Simulation is the default; going live takes a --live flag.


WHAT THIS IS NOT

Mostly testnet. One transaction on Base mainnet proves the path, but the money
moving daily is testnet money.

Nobody outside the project has paid for a call. The rail works and every
transaction above is real, but demand is unproven — and for a project about an
agent earning its keep, that is the honest gap.

x402's exact scheme needs EIP-3009. Tempo's enshrined stablecoins do not
implement it — authorizationState reverts and eth_getCode returns one byte, so
they are precompiles exposing EIP-2612 permit instead. The revenue endpoint
therefore runs on Base while the memo and fee accounting run on Tempo.
```

## Link to code

```
https://github.com/PHUOCHAU2403/keeperhub-agent
```

## Demo video

Kịch bản ở [BOUNTY-buidl-fields.md](BOUNTY-buidl-fields.md), nhưng video cho giải
chính phải khác video bounty — bounty nói về **trải nghiệm onboarding**, giải
chính nói về **agent chạy**. Bốn cảnh, khoảng ba phút:

1. `npm test` — 41 xanh, không mạng. *"Every money decision is provable offline."*
2. `npm run once:live` trên Tempo — sổ cái, quyết định, giao dịch, rồi **đọc lại
   receipt từ RPC công khai**. Chỉ vào dòng phí 0.000021 PathUSD.
3. Mở [biên nhận Tempo](https://explore.testnet.tempo.xyz/receipt/0x73cd35ddd4f2c6b3785aadaf2715884d2c0209b13aa7b6602ce040ed23173973)
   — memo `SWEEP-0001-20260805` hiện thành một trường có nhãn, cạnh nút xuất PDF.
4. `npm run status` — 12 chu kỳ, 2 thực thi, **10 lần kiềm chế**. Câu chốt:
   *"A ledger with only actions cannot show that an agent knows when to hold."*

Lời thoại dùng TTS như các video trước.

## Tags

```
autonomous-agents · x402 · payments · tempo · base · stablecoins
agent-economics · onchain-execution
```

## Ảnh bìa

Chụp [biên nhận Tempo](https://explore.testnet.tempo.xyz/receipt/0x73cd35ddd4f2c6b3785aadaf2715884d2c0209b13aa7b6602ce040ed23173973).
Nó nói hết luận điểm trong một khung: người gửi là ví agent, đơn vị PathUSD,
memo do agent tự sinh, phí cùng đồng tiền. Không cần vẽ sơ đồ kiến trúc nào.

---

## Một quyết định cậu phải chốt

**Nộp một BUIDL hay hai?**

DoraHacks thường cho một BUIDL vừa dự track chính vừa apply bounty. Nếu được thì
**gộp** — con agent chạy thật làm chứng thực cho bảy phát hiện onboarding, và
câu chuyện "tôi vào, đâm vào bảy bức tường, báo cáo, họ sửa cả bảy, rồi tôi xây
xong cái này" mạnh hơn hai bài rời.

Nếu form bắt tách thì nộp hai: bài này cho giải chính, `BOUNTY-buidl-fields.md`
cho bounty.

Câu hỏi ngắn để hỏi ban tổ chức: *"Can one BUIDL apply to both the main prize
and the onboarding bounty, or do I need two?"*
