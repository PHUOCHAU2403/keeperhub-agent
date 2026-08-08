# Best Onboarding UX Improvement — submission

**Nguyen Phuoc Hau** · github.com/PHUOCHAU2403 · sieusayza@gmail.com

---

## Summary

Four onboarding defects, found in the first twenty minutes of a genuinely
first-time install, each written up with a reproduction and a proposed fix.

**All four were reviewed and shipped by KeeperHub the same week.** Joel Orzet
(KeeperHub Engineer) confirmed in writing on 4 August, cc'ing Simon:

> "We received it, reviewed each point carefully, and **all four checked out**.
> Here's what we shipped this week: […] All merged and rolling out to
> docs.keeperhub.com. Thanks again for taking the time to write these up.
> **It genuinely made the product better for the next person.**"

I had never used KeeperHub before 2 August. That is the whole value of the
report — these are the things a first-timer hits and an experienced user has
already forgotten.

---

## 1. The MCP install command is missing `--scope user`

**What the docs said**

```bash
claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp
```

**What happens.** `claude mcp add` defaults to *local* scope, binding the server
to whichever directory you happened to run it in. I ran it from `C:\Users\PC`,
which is not where any of my code lives.

**Why it hurts.** It fails silently and late. You authenticate successfully, see
`connected`, then `cd` into your actual project and the tools are simply gone —
with no error explaining why. You are left doubting the install rather than the
scope.

**Proposed fix.** Ship `--scope user` in the default command, with one line on
what scope means.

**Shipped:** *"the install command now includes `--scope user` everywhere (docs
and onboarding), so the server follows you across projects."*

---

## 2. The onboarding screen lists a command that always fails

**What the "Connect your AI agent" screen said**

```
/plugin marketplace add KeeperHub/claude-plugins
/plugin install keeperhub@keeperhub-plugins
/keeperhub:login
```

**What happens.** Run them in that order and the third returns
`Unknown command: /keeperhub:login`. Claude Code prints *"Run /reload-plugins to
apply"* after the install — the plugin's commands do not exist until that runs.

**Why it hurts.** This is not an edge case. It hits every user who follows the
instructions exactly, which is every new user. And the failure looks like a
broken plugin, not a missing step.

**Proposed fix.** Insert the reload between steps 2 and 3, on the onboarding
screen and in the docs.

**Shipped:** *"`/keeperhub:login` is now a separate step after an explicit
'Restart Claude Code,' so it won't fail on a fresh install."*

---

## 3. "Login expired · Please run /login" does not say which login

**What happens.** Every `/keeperhub:*` command returned this, so I went looking
for an expired KeeperHub session — checked the dashboard, considered
regenerating the API key. The expired session was my *Claude Code* one.

**Why it hurts.** The message appears under a `/keeperhub:` command, so the
reader reasonably attributes it to KeeperHub. Time is spent in the wrong system.

**Proposed fix.** Disambiguate: *"Your Claude Code session has expired — run
/login. This is not your KeeperHub session; check that with
/keeperhub:status."*

**Shipped:** *"we added a docs note explaining it refers to your Claude account,
not KeeperHub (check KeeperHub with /keeperhub:status)."*

---

## 4. A successful transaction looks like a failed one — the one I would prioritise

**What happens.** My first transaction reported success, so I verified it
independently against a public Sepolia RPC rather than trusting the API. What I
found:

```
from   0xa17cb6ad…   ← not my wallet
to     0x5af5194b…   ← a contract I never called
value  0             ← I sent 0.0001
```

My wallet also has code at its address, so it is a smart account, not the EOA I
assumed. My first read was that the transaction had failed.

**Why it hurts.** Nothing in the docs said the Turnkey wallet is a smart account
or that sponsored writes go out through a relayer. Anyone who checks their own
work — exactly the users you want — reaches the same wrong conclusion. Worse,
the natural next move is to retry, which risks a duplicate.

**Proposed fix.** A short page: *what your transaction looks like on-chain* —
relayer as sender, `value: 0` at the top level, the real transfer as an internal
call, and the instruction to verify by transaction hash rather than by wallet
address.

**Shipped:** *"We added a new page, 'What Your Transaction Looks Like On-Chain,'
covering exactly what you saw. Sponsored writes go through a relayer, so the
sender looks unfamiliar and the top-level value is 0. Verify by the transaction
hash, not your wallet address."*

---

## Found later, while building on top

These three came out of real use after the report above, and were sent on
4 August. Joel replied on 7 August, again cc'ing Simon:

> "Thank you, these were good ones. **All three are addressed and will go out
> with the next release**: the search behaviour, the ABI decoder message, and
> the on-chain appearance page, which is **now per-network with Tempo covered**.
> […] Really appreciate the detail you put into these. **Keep them coming.**"

So the running total is **seven findings reported, seven accepted and shipped**,
across two rounds, both confirmed in writing.

One correction, which belongs here rather than buried: Joel could not reproduce
finding 5, and he was right. I re-ran it on 8 August and a bare `swap` now
returns 26 actions including `uniswap/swap-exact-input`. The tool's own
description today reads "Keyword search across action names, **descriptions**,
and action types" — which is exactly the behaviour that was missing. Whether
that wording is new or my original run hit a transient state, I cannot tell from
outside, so finding 5 should be read as unconfirmed rather than as a defect that
still stands. It is left in below because the reasoning about search behaviour
holds regardless, but the evidence for it does not.

### 5. `search_protocol_actions` does not search action descriptions

Querying `swap` returns zero results even though `uniswap/swap-exact-input`
exists; you only find it by filtering `protocol: "uniswap"`. A user who does not
already know the protocol name concludes the capability is missing.

Same class of failure as #1 and #3: the tool reports absence where the real
answer is "you asked the wrong way."

### 6. An ABI return-type mismatch surfaces as a raw ethers decode error

Calling Tempo's TIP-20 `transferWithMemo` through `/api/execute/contract-call`
returned:

```
Contract call failed: could not decode result data (value="0x",
info={ "method": "transferWithMemo",
       "signature": "transferWithMemo(address,uint256,bytes32)" },
code=BAD_DATA, version=6.16.0)
```

The cause was my ABI: I declared `outputs: [{ type: "bool" }]` by analogy with
ERC-20 `transfer`, but TIP-20 `transferWithMemo` returns nothing. The contract
sent back empty data and the decoder wanted 32 bytes.

**Why it hurts.** The message describes the *decoder's* disappointment, not the
mistake. Nothing in it says "the ABI you supplied declares a return value this
function does not have" — which is the one sentence that would have fixed it
instantly. It also leaks the ethers version, which tells the user about your
internals rather than about their input. And the ERC-20 analogy makes this a
trap almost everyone reaching for a non-standard token method will step into.

**Proposed fix.** When return data is empty and the supplied ABI declares
outputs, say exactly that: *"Contract returned no data, but the ABI you supplied
declares 1 output (bool). If this function returns nothing, use `outputs: []`."*

### 7. "What Your Transaction Looks Like On-Chain" is true of Base, not of Tempo

This is feedback on the page shipped for finding #4 — the fix is right, the
generalisation is not.

The page says sponsored writes go through a relayer, so the sender looks
unfamiliar and the top-level value is 0. That held for my Base transactions.
It does not hold on Tempo Moderato. Same agent, same API, two receipts read
straight from public RPC:

| | Base mainnet | Tempo Moderato |
|---|---|---|
| tx `from` | relayer, not my wallet | **my own wallet** |
| fee | gas in ETH, sponsored, invisible | **0.000021 PathUSD, an ERC-20 `Transfer` to `0xfeec…0000` in the same receipt** |

A user who reads that page and then verifies a Tempo transaction will be
confused in the opposite direction: they are told to expect an unfamiliar
sender and they see their own address.

**Proposed fix.** Make the page per-chain rather than universal, and add the
Tempo row. The fee point is worth calling out on its own: because Tempo has no
native token, the fee is denominated in the same stablecoin being moved, so it
is readable from the receipt in the same unit as the payment. For anyone doing
agent accounting, that is a feature, not a footnote.

Evidence — both readable in one click, and both independently checkable against
`https://rpc.moderato.tempo.xyz`:

- https://explore.testnet.tempo.xyz/receipt/0x58a99c37cba90ff1cd37ac161000f6f63ed3ca1feea9fc3ff3797e73e06e7702
- https://explore.testnet.tempo.xyz/receipt/0x73cd35ddd4f2c6b3785aadaf2715884d2c0209b13aa7b6602ce040ed23173973

Worth a look even aside from the point above: Tempo's explorer renders a payment
as a *receipt*, with the memo printed as a labelled field and PDF/TXT/JSON
export beside it. That is what the memo is for, and it is the clearest argument
I have seen for putting the reconciliation reference on the chain rather than in
the agent's own book.

---

## Evidence

- **First confirmation** from Joel Orzet, KeeperHub Engineer, 4 Aug 2026
  (cc simon@keeperhub.com): all four findings checked out, all merged.
- **Second confirmation**, 7 Aug 2026, same thread and cc: all three later
  findings addressed and shipping with the next release.
- **Original report** sent 3 Aug 2026 to simon@keeperhub.com, one day after
  signup. Second report 4 Aug. Screenshots of both replies available.
- **Working agent** built during the same period, proving the path these fixes
  clear: https://github.com/PHUOCHAU2403/keeperhub-agent

Transactions executed through KeeperHub while finding these:

| Network | Transaction |
|---|---|
| Ethereum Sepolia | `0x17bca839d48b87667c263e1b7bafc8c301320c3ece556129ba305d6c1418703e` |
| Base Sepolia | `0x9ed76e1639a26cc72f72305b7452463cc40ca7d826463b49c2941b52b49e35ed` |
| Base mainnet | `0xac06f259f897ac1213f654acc5e78246ef1c95b65bf5cf468d95b3a83f9a7221` |
| Base Sepolia (x402 settlement) | `0x3d182c31dd9b9c678f782c7b664d718ea945f9ca3b70a2aa95a2ce05d6485413` |
| Tempo Moderato (TIP-20 memo) | `0x58a99c37cba90ff1cd37ac161000f6f63ed3ca1feea9fc3ff3797e73e06e7702` |

---

## Why these four and not others

I kept only defects that (a) hit every new user rather than my particular setup,
(b) I could reproduce and explain, and (c) I could propose a concrete fix for.
Anything I merely disliked, I left out.

The through-line is that all four fail *quietly*. None throws an error naming
the real cause: the tools vanish without explanation, the command reports the
wrong subject, the transaction looks like someone else's. Silent failure is
expensive for a new user because there is nothing to search for.
