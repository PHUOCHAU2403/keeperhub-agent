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

## Proven onchain, day one

Three real transactions executed through KeeperHub before a line of agent code
was written — the execution path was verified before anything was built on it:

| Network | Transaction | Gas |
|---|---|---|
| Ethereum Sepolia | [`0x17bca839…`](https://sepolia.etherscan.io/tx/0x17bca839d48b87667c263e1b7bafc8c301320c3ece556129ba305d6c1418703e) | sponsored |
| Base Sepolia | [`0x9ed76e16…`](https://sepolia.basescan.org/tx/0x9ed76e1639a26cc72f72305b7452463cc40ca7d826463b49c2941b52b49e35ed) | sponsored |
| **Base mainnet** | [`0xac06f259…`](https://basescan.org/tx/0xac06f259f897ac1213f654acc5e78246ef1c95b65bf5cf468d95b3a83f9a7221) | sponsored |

Each was sent from a wallet holding **zero ETH**. KeeperHub's relayer paid the
gas, on mainnet included. That single fact removed a whole subsystem from the
design — see below.

---

## The loop

```
SENSE     read USDC balance through KeeperHub
   ↓
DECIDE    pure functions in src/rules.js — no network, no wallet
   ↓
GUARD     per-action cap + session budget, checked BEFORE any API call
   ↓
EXECUTE   through KeeperHub — sponsored gas, idempotency, status polling
   ↓
RECORD    append-only ledger, including the cycles where it did nothing
```

---

## Design decisions worth defending

**Gas sponsorship removed a subsystem.** The first design had the agent hold ETH,
watch its gas balance, and swap USDC→ETH when it ran low. Then a 0-value transfer
went through on Base mainnet from an empty wallet with `sponsored: true`. The
swap path, the gas balance check, and the second-token accounting all came out.
The agent's economics are pure USDC now. Verify first, build second.

**Thinking is separated from doing.** `rules.js` is pure functions. Every money
decision is testable with no network, no funded wallet, and no waiting on a
chain. 11 tests cover the decision boundaries and every guardrail rejection.
Anything that moves money should be provable offline — by the time you learn the
behaviour from a live API call, it is already too late.

**The agent must be able to refuse itself.** Guards run *before* the API call,
never after. A rule can want to move 995 USDC; the guard is what stops it. The
test suite asserts that separation explicitly.

**Failed executions are not recorded as spend.** If a call throws, the session
budget is untouched. Otherwise the budget drains on transactions that never
reached a chain.

**Idempotency keys are derived, not random.** `sweep-{chain}-{cycle}-{amount}`.
A network retry returns the original result instead of transferring twice.

**The ledger records restraint.** Cycles where the agent decided to do nothing
are written with the reason. A ledger containing only actions cannot show that
an agent knows when to hold — and holding is the harder behaviour.

**Simulation is the default.** `simulate: true` is on unless explicitly disabled.
The full loop runs — balance reads, decisions, guards, API round-trip — without
broadcasting. Going live requires deliberately setting `SIMULATE=0`.

---

## Run it

```bash
cp .env.example .env      # add your kh_ API key
npm run once              # one cycle, simulated
npm run loop              # continuous
npm run status            # ledger summary
node --test test/rules.test.mjs
```

Defaults to Base Sepolia and simulation. Set `CHAIN=base` and `SIMULATE=0` to go
live.

## Layout

```
src/config.js      thresholds, chains, guardrail limits — all tunables in one place
src/rules.js       the decisions, as pure functions
src/keeperhub.js   thin REST client — only the four calls the agent needs
src/agent.js       the loop; I/O only
src/ledger.js      append-only decision log
test/              offline verification of every decision boundary
```

## Status

Core loop running. Next: the x402 revenue endpoint feeding the balance, and the
spend side — the agent signing EIP-3009 authorizations through KeeperHub's
`sign-typed-data` to buy data from other agents.

---

MIT
