# An agent with its own balance sheet

An autonomous agent that **earns**, **decides**, and **spends** on its own —
every onchain action executed through [KeeperHub](https://keeperhub.com).

Built for the **KeeperHub Agents Onchain Hackathon** (Aug 2026).

---

## The gap this sits in

KeeperHub's own framing:

> x402 and MPP solve how AI agents **pay**. How they **act** onchain is the other
> half. Neither protocol addresses execution.

I work on both sides of that line already — I built an x402 pay-per-call rail
that settles USDC on Arc, and I run Tempo MPP payments daily. This project is
the piece between them: an agent whose revenue arrives over x402 and whose
outgoing actions run through KeeperHub's execution layer.

Not an agent that watches something and messages a human. An agent that
**moves its own money**.

---

## Proven onchain

Every claim below is a real transaction, and each was read back from a public
RPC rather than trusted from the API response.

Three went out before a line of agent code existed — the execution path was
verified before anything was built on top of it:

| Network | Transaction | Gas |
|---|---|---|
| Ethereum Sepolia | [`0x17bca839…`](https://sepolia.etherscan.io/tx/0x17bca839d48b87667c263e1b7bafc8c301320c3ece556129ba305d6c1418703e) | sponsored |
| Base Sepolia | [`0x9ed76e16…`](https://sepolia.basescan.org/tx/0x9ed76e1639a26cc72f72305b7452463cc40ca7d826463b49c2941b52b49e35ed) | sponsored |
| **Base mainnet** | [`0xac06f259…`](https://basescan.org/tx/0xac06f259f897ac1213f654acc5e78246ef1c95b65bf5cf468d95b3a83f9a7221) | sponsored |

Each was sent from a wallet holding **zero ETH**. KeeperHub's relayer paid the
gas, on mainnet included. That single fact removed a whole subsystem from the
design — see below.

Then the agent itself:

| What | Transaction |
|---|---|
| First autonomous sweep | [`0x3a5a7332…`](https://sepolia.basescan.org/tx/0x3a5a7332bc47da464c62d5710f817c6dfdba6a11253b4ae28a6d7a292d8aabbc) |
| x402 revenue settled through KeeperHub | [`0x3d182c31…`](https://sepolia.basescan.org/tx/0x3d182c31dd9b9c678f782c7b664d718ea945f9ca3b70a2aa95a2ce05d6485413) |
| TIP-20 transfer carrying a memo | [`0x58a99c37…`](https://explore.testnet.tempo.xyz/receipt/0x58a99c37cba90ff1cd37ac161000f6f63ed3ca1feea9fc3ff3797e73e06e7702) |
| **Autonomous sweep with an onchain reference** | [`0x73cd35dd…`](https://explore.testnet.tempo.xyz/receipt/0x73cd35ddd4f2c6b3785aadaf2715884d2c0209b13aa7b6602ce040ed23173973) |

---

## The loop

```
SENSE     read the stablecoin balance through KeeperHub
   ↓
DECIDE    pure functions in src/rules.js — no network, no wallet
   ↓
GUARD     per-action cap + session budget, checked BEFORE any API call
   ↓
EXECUTE   through KeeperHub — sponsored gas, idempotency, status polling
   ↓
CONFIRM   re-read the receipt from a public RPC, not from the API
   ↓
RECORD    append-only ledger, including the cycles where it did nothing
```

---

## Why Tempo is wired in

Not for a second chain on the list. For one property that changes the
accounting.

Tempo has no native token, so a transfer's fee is charged **in the same
stablecoin being moved**, and it lands as an extra ERC-20 `Transfer` inside the
same receipt. Cost and revenue therefore share a unit, and the balance sheet
closes without an FX step. On Base the fee is gas in ETH — a different asset,
sponsored, and invisible to the agent.

TIP-20 adds `transferWithMemo(address,uint256,bytes32)`, and the memo is an
*indexed* event parameter. A payment carries its own reconciliation reference,
filterable at the log layer. Tempo's explorer renders the result as a receipt
with the memo as a labelled field and a PDF export beside it.

The agent uses a readable ASCII memo (`SWEEP-0001-20260805`) rather than a hash.
A hash only reconciles for someone already holding the lookup table; a readable
string reconciles for anyone who opens the chain — an auditor included. That is
the only thing a memo is uniquely good for, so it should not be spent on a hash.

The decision is identical on every chain. Only the fidelity of the reference
differs, and the ledger records which one it got:

```json
{ "memo": "SWEEP-0001-20260805", "memoOnChain": true,
  "feeInToken": 0.000021, "verified": true }
```

---

## Design decisions worth defending

**Gas sponsorship removed a subsystem.** The first design had the agent hold ETH,
watch its gas balance, and swap USDC→ETH when it ran low. Then a 0-value transfer
went through on Base mainnet from an empty wallet with `sponsored: true`. The
swap path, the gas balance check, and the second-token accounting all came out.
Verify first, build second.

**Thinking is separated from doing.** `rules.js` is pure functions. Every money
decision is testable with no network, no funded wallet, and no waiting on a
chain. 23 tests cover the decision boundaries, every guardrail rejection, and
the memo encoding. Anything that moves money should be provable offline — by the
time you learn the behaviour from a live API call, it is already too late.

**The agent must be able to refuse itself.** Guards run *before* the API call,
never after. A rule can want to move 995; the guard is what stops it. The test
suite asserts that separation explicitly.

**The executor does not get to grade its own work.** After every live execution
the agent re-reads the receipt from a public RPC. This is not distrust of
KeeperHub — it is that one party should not be both the actor and the sole
witness. The first transaction taught the lesson: the API reported success while
the receipt showed an unfamiliar sender and `value: 0`. The API was right. I
only knew that after going to the chain myself.

**"Not measurable" is not "zero".** The ledger keeps `feeMeasured` and
`feeUnmeasured` as separate counts. On Base the fee is sponsored gas in another
asset, so the agent cannot state a number; writing 0 there would make the
balance sheet assert something it does not know.

**Failed executions are not recorded as spend.** If a call throws, the session
budget is untouched. Otherwise the budget drains on transactions that never
reached a chain.

**Idempotency keys are derived from the intent, not the loop counter.** They were
originally `sweep-{chain}-{cycle}-{amount}`, which is wrong in a way simulation
cannot reveal: the cycle counter restarts at 1 with the process, so two sessions
moving equal amounts produce the same key, and KeeperHub correctly refuses the
second — a legitimate sweep, rejected. The key now derives from the
reconciliation reference, which carries the date: retries within a day collapse
onto one key, a new day gets a new one.

**The ledger records restraint.** Cycles where the agent decided to do nothing
are written with the reason. A ledger containing only actions cannot show that
an agent knows when to hold — and holding is the harder behaviour. A typical
run: 11 cycles, 2 executed, 9 held back.

**Simulation is the default.** The full loop runs — balance reads, decisions,
guards, API round-trip — without broadcasting. Going live takes a deliberate
`--live` flag.

---

## Run it

```bash
cp .env.example .env      # add your kh_ API key
npm test                  # 23 offline tests, no network
npm run once              # one cycle, simulated
npm run loop              # continuous
npm run status            # ledger summary
npm run once:live         # broadcast for real
```

Defaults to Base Sepolia and simulation. `CHAIN` selects the network:
`base-sepolia`, `base`, `tempo-moderato`.

The paid endpoint runs separately:

```bash
npm run serve             # x402 /signal endpoint on :4182
npm run buy               # test buyer, signs an EIP-3009 authorization
```

## Layout

```
src/config.js      chains, thresholds, guardrail limits — all tunables in one place
src/rules.js       the decisions, as pure functions
src/memo.js        bytes32 reconciliation references for TIP-20
src/keeperhub.js   thin REST client — only the calls the agent needs
src/receipt.js     independent verification against a public RPC
src/agent.js       the loop; I/O only
src/ledger.js      append-only decision log, both sides of the balance sheet
src/x402.js        the selling side — payment challenge and settlement
src/server.js      the paid /signal endpoint
test/              offline verification of every decision boundary
```

## Status

Both sides of the balance sheet are live: revenue arrives over x402 and settles
through KeeperHub, outflows carry an onchain reference on Tempo, and every
execution is confirmed against a public RPC.

Next: the buying side — the agent paying other agents for data, so the ledger
shows a cost of goods rather than only a cost of settlement.

---

MIT
