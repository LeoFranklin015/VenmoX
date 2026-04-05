# CloakPay

**Private crypto payments for the real world.**

CloakPay is a mobile wallet on Base that works like Venmo at a merchant POS terminal, except your on-chain identity stays completely hidden. The merchant gets paid in USDC, you get a receipt, and there is no traceable link between your wallet and the payment.

## The Problem

Crypto is trying to replace cash and cards for everyday payments. Stablecoins on L2s like Base have made this technically possible: fees are sub-cent, settlement is instant, and USDC is dollar-denominated. The infrastructure is ready.

But there is a fundamental design flaw that nobody has fixed for the POS use case.

**Every transaction is public.** When you pay a merchant with your wallet, you hand them your address. That address is a window into everything: your balance, every transaction you have ever made, every token you hold, every protocol you have interacted with. The cashier at a coffee shop can look up your net worth. The merchant can sell your spending patterns. Anyone watching the chain can build a complete financial profile of you.

This is not a theoretical concern. It is the reason institutions will not adopt on-chain payments for their customers. No bank, no fintech, no payment processor will ship a product where every customer's full financial history is visible to every merchant they transact with.

**Existing privacy solutions do not solve this.** The current approaches in crypto privacy were designed for different threat models:

- **ERC-5564 stealth addresses** hide the receiver. But at a POS terminal, the receiver is the merchant. Everyone already knows who they are. Hiding the merchant address does nothing.
- **Mixers and tumblers** (Tornado Cash model) break the link between deposits and withdrawals, but they are designed for transfers between your own addresses, not for real-time merchant payments at a checkout counter.
- **Privacy chains** (Zcash, Monero) require merchants to accept a different currency on a different chain. That is a non-starter for mainstream adoption.

The actual privacy leak at a POS terminal is the **sender**. Your wallet address, your balance, your history. That is what needs to be hidden, and nothing in production today does this.

## The Solution

CloakPay flips the standard stealth model. Instead of hiding who receives funds, it hides who sends them.

The core challenge is straightforward: if you create a temporary address and fund it from your main wallet, the link is already visible on-chain. The funding transaction defeats the entire purpose. So the architecture needs to break that link before the payment ever happens.

CloakPay solves this with a two-layer approach:

### Layer 1: Break the Link (Privacy Pool)

The user deposits USDC from their main wallet into a shared privacy pool powered by Unlink. The pool uses zero-knowledge proofs to sever the connection between deposits and withdrawals. When funds come out of the pool, there is no on-chain way to determine which deposit they came from.

This is not a mixer. It is a ZK-proven privacy pool where the cryptographic guarantee is that deposits and withdrawals are unlinkable, while still proving the withdrawal is backed by a valid deposit.

### Layer 2: Ephemeral Sender (One-Time Address)

Funds withdrawn from the pool go to a freshly derived ephemeral address. This address exists for exactly one purpose: sign the payment at the POS terminal. After the transaction settles, the ephemeral address is destroyed. The keys are deleted. It is gone.

The merchant sees a payment from a random address that has no history, no other transactions, and no connection to any identity. The USDC arrives, the payment is valid, and that is all they know.

```
User's Wallet
     |
     | deposit (visible, but only shows "user → pool")
     v
 [Privacy Pool]        ← ZK proof breaks the link here
     |
     | withdraw (pool → ephemeral, no link to original deposit)
     v
Ephemeral Sender
     |
     | payment (ephemeral → merchant via WalletConnect Pay)
     v
  Merchant POS          ← merchant sees a random address, nothing else
```

The user holds a viewing key derived from their master spending key. This lets them scan and reconstruct their own transaction history locally without exposing it to anyone else. They can see every payment they have made. Nobody else can connect those payments to them.

### Why This Matters for Institutional Adoption

This architecture gives crypto payments the same privacy properties that traditional card payments already have. When you tap your Visa card, the merchant gets paid but cannot see your bank balance or transaction history. CloakPay brings that same baseline to on-chain payments.

That is the bar for institutional adoption. Not perfect anonymity. Not untraceable dark money. Just the basic expectation that paying for lunch does not publish your financial life to the person behind the counter.

## What CloakPay Actually Does

### Merchant Payments (Base Mainnet)

The merchant creates a payment request on the WalletConnect Pay terminal. The customer opens CloakPay, scans the QR code, and confirms. Under the hood:

1. The wallet creates an ephemeral address
2. The user's smart account sends USDC to the ephemeral (gasless, signed with passkey)
3. The ephemeral signs a Permit2 approval for WalletConnect Pay
4. WalletConnect Pay settles the payment with the merchant
5. The ephemeral is destroyed

From the merchant's perspective: they got paid in USDC on Base. From the chain's perspective: a random address that appeared, paid, and vanished. From the user's perspective: they tapped a button.

### Private P2P Transfers (Base Sepolia)

For person-to-person payments, the full privacy pool pipeline runs:

1. User's smart account funds an ephemeral wallet
2. Ephemeral deposits into the Unlink privacy pool
3. A new address is funded from the pool (ZK break happens here)
4. That address transfers USDC to the recipient
5. Both intermediate addresses are destroyed

The recipient gets paid. There is no on-chain path connecting sender to recipient.

### Recurring Subscriptions (ERC-7715)

CloakPay implements crypto-native subscriptions using ERC-7715 delegated permissions:

1. Merchant publishes a subscription plan (amount, period)
2. Customer scans a QR code and approves a time-limited, amount-capped permission on their smart account
3. The merchant's backend can charge within those bounds, server-side, without the customer signing each time
4. The customer can revoke the permission from their wallet at any time

No card numbers. No billing infrastructure. No chargebacks. Just on-chain permission delegation with hard spending limits enforced at the smart account level.

### Wallet UX

The wallet is a PWA (progressive web app) that installs on the home screen and runs like a native app:

- **Passkey authentication.** No seed phrases, no private key management. The wallet is controlled by Face ID, fingerprint, or device PIN through WebAuthn. Keys live in the device's secure enclave.
- **ENS identity.** Every user gets `username.cloak.eth`, a human-readable name that resolves to their Base address. Send money to `alice.cloak.eth` instead of a hex string.
- **Gasless transactions.** The JAW smart account uses a paymaster. Users never need ETH for gas.
- **Smart accounts (ERC-7702).** Account abstraction handles batched transactions, delegated permissions, and recovery through passkey cloud sync.

## Architecture

| | **Wallet** (`/wallet`) | **Merchant Dashboard** (`/web`) |
|---|---|---|
| **What** | Mobile PWA for customers | Web dashboard for merchants |
| **Auth** | Passkey (Face ID / fingerprint) | API key |
| **Chain** | Base mainnet + Sepolia testnet | Base mainnet |
| **Payments** | WalletConnect Pay SDK (wallet side) | WalletConnect Pay Merchant API |
| **Privacy** | Unlink ZK privacy pools, ephemeral senders | N/A (merchant does not need privacy) |
| **Accounts** | JAW smart accounts (passkey, ERC-7702) | JAW account (for subscription charging) |
| **Identity** | ENS subnames (`user.cloak.eth`) | N/A |
| **Subscriptions** | ERC-7715 `grantPermissions` | ERC-7715 `sendCalls` with permission ID |

## How It Compares

| | Traditional Crypto Wallet | Stealth Addresses (ERC-5564) | CloakPay |
|---|---|---|---|
| **What's hidden** | Nothing | Receiver | **Sender** |
| **POS use case** | Merchant sees your full history | Does not help (merchant is the known receiver) | Merchant sees a disposable address, nothing else |
| **Link breaking** | None | Receiver-side key derivation | ZK privacy pool + ephemeral sender |
| **Auth** | Seed phrase | Seed phrase | Passkey (Face ID / fingerprint) |
| **Gas** | User pays ETH | User pays ETH | Gasless via paymaster |
| **Identity** | Raw hex address | Raw hex address | `username.cloak.eth` |
| **Subscriptions** | Not supported | Not supported | ERC-7715 delegated permissions |
| **Institutional ready** | No (public by design) | Partial (hides wrong party) | Yes (same privacy model as cards) |

## Built With

- [Unlink](https://unlink.xyz) — ZK privacy pool for breaking deposit-to-withdrawal links
- [WalletConnect Pay](https://pay.walletconnect.org) — Merchant payment terminal and settlement infrastructure
- [JustaName / JAW](https://justaname.id) — Passkey-based smart accounts, ENS subname registration and resolution
- [Base](https://base.org) — Ethereum L2 (low fees, native USDC)
- Next.js 16, React 19, Tailwind CSS 4, MongoDB

## License

MIT
