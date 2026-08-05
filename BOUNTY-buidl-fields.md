# BUIDL fields — copy/paste vào form DoraHacks

Bài đầy đủ nằm ở BOUNTY-onboarding.md. File này chỉ là nội dung cắt sẵn
theo từng ô của form.

---

## BUIDL name

```
The First Twenty Minutes
```

## Tagline / short intro

```
Four onboarding defects found on day one with KeeperHub. All four were
reviewed and shipped by the team the same week.
```

## Description

```
I signed up for KeeperHub on 2 August, having never used it before. Within
the first twenty minutes I hit four things that stopped me. I wrote each one
up with a reproduction and a proposed fix and sent them to the team on
3 August.

On 4 August, Joel Orzet (KeeperHub Engineer) replied, cc'ing Simon:

  "We received it, reviewed each point carefully, and all four checked out.
   Here's what we shipped this week: [...] All merged and rolling out to
   docs.keeperhub.com. Thanks again for taking the time to write these up.
   It genuinely made the product better for the next person."

This BUIDL is that report.


1. THE MCP INSTALL COMMAND IS MISSING --scope user

The documented command was:

  claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp

claude mcp add defaults to LOCAL scope, binding the server to whichever
directory you ran it in. I ran it from C:\Users\PC, which is not where any
of my code lives.

Why it hurts: it fails silently and late. You authenticate successfully,
see "connected", then cd into your actual project and the tools are simply
gone, with no error explaining why. You end up doubting the install rather
than the scope.

Fix proposed: ship --scope user in the default command, with one line on
what scope means.

SHIPPED: "the install command now includes --scope user everywhere (docs and
onboarding), so the server follows you across projects."


2. THE ONBOARDING SCREEN LISTS A COMMAND THAT ALWAYS FAILS

The "Connect your AI agent" screen said:

  /plugin marketplace add KeeperHub/claude-plugins
  /plugin install keeperhub@keeperhub-plugins
  /keeperhub:login

Run them in that order and the third returns "Unknown command:
/keeperhub:login". Claude Code prints "Run /reload-plugins to apply" after
the install; the plugin's commands do not exist until that runs.

Why it hurts: this is not an edge case. It hits every user who follows the
instructions exactly, which is every new user. And the failure looks like a
broken plugin rather than a missing step.

Fix proposed: insert the reload between steps 2 and 3, on the onboarding
screen and in the docs.

SHIPPED: "/keeperhub:login is now a separate step after an explicit
'Restart Claude Code,' so it won't fail on a fresh install."


3. "LOGIN EXPIRED - PLEASE RUN /login" DOES NOT SAY WHICH LOGIN

Every /keeperhub:* command returned this, so I went looking for an expired
KeeperHub session: checked the dashboard, considered regenerating the API
key. The expired session was my Claude Code one.

Why it hurts: the message appears under a /keeperhub: command, so the reader
reasonably attributes it to KeeperHub, and spends time in the wrong system.

Fix proposed: disambiguate. "Your Claude Code session has expired - run
/login. This is not your KeeperHub session; check that with
/keeperhub:status."

SHIPPED: "we added a docs note explaining it refers to your Claude account,
not KeeperHub (check KeeperHub with /keeperhub:status)."


4. A SUCCESSFUL TRANSACTION LOOKS LIKE A FAILED ONE

This is the one I would prioritise.

My first transaction reported success, so I verified it independently
against a public Sepolia RPC rather than trusting the API response. What I
found:

  from    0xa17cb6ad...    not my wallet
  to      0x5af5194b...    a contract I never called
  value   0                I sent 0.0001

My wallet also has code at its address, so it is a smart account, not the
EOA I had assumed. My first read was that the transaction had failed.

Why it hurts: nothing in the docs said the Turnkey wallet is a smart account
or that sponsored writes go out through a relayer. Anyone who checks their
own work - exactly the users you want - reaches the same wrong conclusion.
Worse, the natural next move is to retry, which risks a duplicate.

Fix proposed: a short page, "what your transaction looks like on-chain":
relayer as sender, value 0 at the top level, the real transfer as an
internal call, and the instruction to verify by transaction hash rather
than by wallet address.

SHIPPED: "We added a new page, 'What Your Transaction Looks Like On-Chain,'
covering exactly what you saw. Sponsored writes go through a relayer, so the
sender looks unfamiliar and the top-level value is 0. Verify by the
transaction hash, not your wallet address."


A FIFTH, FOUND LATER WHILE BUILDING

search_protocol_actions does not search action descriptions. Querying "swap"
returns zero results even though uniswap/swap-exact-input exists; you only
find it by filtering protocol: "uniswap". A user who does not already know
the protocol name concludes the capability is missing.

Same class of failure as 1 and 3: the tool reports absence where the real
answer is "you asked the wrong way." This one is not yet reported.


EVIDENCE

Confirmation email from Joel Orzet, KeeperHub Engineer, 4 August 2026,
cc simon@keeperhub.com, subject "Re: KeeperHub setup feedback". Screenshot
attached.

Original report sent 3 August 2026 to simon@keeperhub.com, one day after
signup.

Working agent built during the same period, proving the path these fixes
clear: https://github.com/PHUOCHAU2403/keeperhub-agent

Transactions executed through KeeperHub while finding these:

  Ethereum Sepolia
  0x17bca839d48b87667c263e1b7bafc8c301320c3ece556129ba305d6c1418703e

  Base Sepolia
  0x9ed76e1639a26cc72f72305b7452463cc40ca7d826463b49c2941b52b49e35ed

  Base mainnet
  0xac06f259f897ac1213f654acc5e78246ef1c95b65bf5cf468d95b3a83f9a7221

  Base Sepolia, x402 settlement
  0x3d182c31dd9b9c678f782c7b664d718ea945f9ca3b70a2aa95a2ce05d6485413

  Tempo Moderato, TIP-20 with memo
  0x58a99c37cba90ff1cd37ac161000f6f63ed3ca1feea9fc3ff3797e73e06e7702


WHY THESE FOUR AND NOT OTHERS

I kept only defects that (a) hit every new user rather than my particular
setup, (b) I could reproduce and explain, and (c) I could propose a concrete
fix for. Anything I merely disliked, I left out.

The through-line is that all four fail quietly. None throws an error naming
the real cause: the tools vanish without explanation, the command reports the
wrong subject, the transaction looks like someone else's. Silent failure is
expensive for a new user because there is nothing to search for.
```

## Source code / GitHub

```
https://github.com/PHUOCHAU2403/keeperhub-agent
```

Bài đầy đủ ở:
`https://github.com/PHUOCHAU2403/keeperhub-agent/blob/main/BOUNTY-onboarding.md`

## Tags

```
developer-experience
onboarding
documentation
mcp
claude-code
onchain-agents
```

## Demo video

Nếu form bắt buộc: quay màn hình 2 phút, không cần lời bình hay nhất, cần
đúng thứ tự này —

1. Mở docs KeeperHub hiện tại, chỉ vào `--scope user` trong lệnh install.
   "Dòng này là do tôi báo."
2. Mở trang "What Your Transaction Looks Like On-Chain". "Trang này cũng vậy."
3. Mở email của Joel, đọc to câu "all four checked out".
4. Mở một tx trên explorer, chỉ vào `from` là relayer và `value 0` —
   đúng cái làm tôi tưởng giao dịch hỏng.

Kết thúc. Đừng giải thích con agent trong video này; để dành cho BUIDL thứ hai.

## Cover image

Không có logo cũng không sao. Nếu ô này bắt buộc: chụp màn hình email của
Joel, phần có câu "all four checked out", dùng luôn làm ảnh bìa. Ảnh bìa đó
tự nó đã nói hết.
