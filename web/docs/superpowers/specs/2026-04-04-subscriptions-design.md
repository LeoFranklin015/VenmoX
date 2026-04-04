# Subscriptions Feature — Design Spec

## Overview

Recurring USDC payment subscriptions using JAW smart account delegated permissions. Merchants create subscription plans in their dashboard, users approve them by scanning a QR code in the wallet app. Merchants can then charge subscribers on-demand using the granted permission.

**Chain:** Base Mainnet (8453)
**Token:** USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)

## Data Model

**MongoDB collection: `subscriptions`** (shared `cannes-wallet` database on Atlas)

```typescript
{
  _id: ObjectId,
  name: string,                // e.g. "Pro Plan"
  description: string,         // e.g. "Monthly access to premium features"
  amount: string,              // USDC amount, human-readable e.g. "10" (not raw decimals)
  period: "day" | "week" | "month" | "year",
  spender: string,             // merchant's spender address (0x...)
  status: "pending" | "active" | "revoked",
  subscriber: string | null,   // wallet address that granted permission
  permissionId: string | null, // returned by grantPermissions, stored for charging
  lastChargedAt: string | null,// ISO 8601 timestamp of last charge
  created_at: string,          // ISO 8601
}
```

Indexed on: `status`, `spender`.

## Merchant Dashboard (web/)

### New env vars required
```
MONGODB_URI=mongodb+srv://...
SPENDER_PRIVATE_KEY=0x...       # private key matching the spender address
NEXT_PUBLIC_JAW_API_KEY=...     # JAW API key for Account.fromLocalAccount
```

### UI Changes

**Navigation:** Add "Subscriptions" item to the sidebar (below Transactions).

**Page: `/dashboard/subscriptions`**
- Header with "Create Subscription" button
- Table listing all subscriptions: name, amount, period, status, subscriber (shortened), actions
- Status badge: pending (grey), active (green), revoked (red)
- Actions per row:
  - **Pending**: show QR code button, delete button
  - **Active**: "Charge" button, show QR button
  - **Revoked**: no actions

**Create Subscription modal/form:**
- Fields: name (text), description (textarea), amount (number, USDC), period (select: day/week/month/year), spender address (text, pre-filled from env or manual input)
- On submit: POST to `/api/subscriptions` → saves to MongoDB → returns subscription ID
- Shows QR code containing: `https://venmo-x.vercel.app/subscribe?id={subscriptionId}`

### API Routes

**`POST /api/subscriptions`** — Create subscription
- Body: `{ name, description, amount, period, spender }`
- Creates document in MongoDB with status `pending`
- Returns: `{ id, name, amount, period, spender }`

**`GET /api/subscriptions`** — List subscriptions
- Query params: optional `status` filter
- Returns: `{ subscriptions: [...] }`

**`GET /api/subscriptions/[id]`** — Get single subscription
- Returns full subscription document (used by wallet to fetch details)

**`POST /api/subscriptions/[id]/charge`** — Charge a subscription
- Validates status is `active` and `permissionId` exists
- Uses `Account.fromLocalAccount()` with `SPENDER_PRIVATE_KEY`
- Calls `account.sendCalls()` with the `permissionId`:
  - `to`: USDC contract
  - `data`: `encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [spenderAddress, parseUnits(amount, 6)] })`
- Updates `lastChargedAt`
- Returns: `{ success, callId }` or error

**`DELETE /api/subscriptions/[id]`** — Delete a pending subscription
- Only works if status is `pending`

### MongoDB Connection

The web app currently has no database. Add a `lib/db.ts` with the same MongoDB connection pattern as the wallet app (singleton MongoClient, reuse connection).

## Wallet App (wallet/)

### New Page: `/dashboard/subscribe`

Accessed via QR scan or deep link: `https://venmo-x.vercel.app/subscribe?id={subscriptionId}`

**Flow:**
1. Page reads `id` from query params
2. Fetches subscription details from `/api/subscriptions/[id]` (wallet's own API route that proxies to the shared MongoDB)
3. Displays: name, description, amount per period, spender address
4. "Approve Subscription" button → calls `account.grantPermissions()`:
   ```
   expiry: calculated from period (e.g. 1 year from now)
   spender: subscription.spender
   permissions:
     calls: [{ target: USDC, functionSignature: 'transfer(address,uint256)' }]
     spends: [{ token: USDC, allowance: parseUnits(amount, 6), unit: period }]
   ```
5. On success: POST to `/api/subscriptions/activate` with `{ subscriptionId, permissionId, subscriber }`
6. Shows success screen

### New API Routes (wallet/)

**`GET /api/subscriptions/[id]`** — Fetch subscription from MongoDB
- Returns subscription details for the approve screen

**`POST /api/subscriptions/activate`** — Activate after granting permission
- Body: `{ subscriptionId, permissionId, subscriber }`
- Updates MongoDB: sets `status: "active"`, `permissionId`, `subscriber`

## QR Code Format

The QR encodes a URL: `https://venmo-x.vercel.app/subscribe?id={mongoObjectId}`

When the wallet's QR scanner detects this URL (not a WalletConnect Pay link), it navigates to the subscribe page instead of the pay flow.

## Charging Flow (Merchant → Server → Blockchain)

```
Merchant clicks "Charge"
  → POST /api/subscriptions/[id]/charge
  → Server loads subscription from MongoDB
  → Server creates JAW Account via Account.fromLocalAccount(spenderPrivateKey)
  → Server calls account.sendCalls([{USDC transfer}], { permissionId })
  → USDC transferred from subscriber's smart account to spender address
  → Server updates lastChargedAt
  → Returns success/failure to dashboard
```

## Security Considerations

- `SPENDER_PRIVATE_KEY` is server-side only, never exposed to client
- The `grantPermissions` spend limit enforces the max amount per period on-chain — the merchant cannot charge more than the user approved
- Users can revoke permissions at any time from their wallet (future feature, not in MVP)
- Subscription details are validated on both sides (wallet shows what the user is approving)

## Wallet — Subscription Management

### Page: `/dashboard/subscriptions` (wallet side)

Accessible from the wallet's bottom nav or dashboard. Shows the user all their active and revoked subscriptions.

**UI:**
- List of subscriptions the user has approved (fetched from MongoDB filtered by `subscriber` = user's address)
- Each row shows: name, amount/period, status, last charged date
- Active subscriptions have a **"Revoke"** button

**Revoke flow:**
1. User taps "Revoke" on an active subscription
2. Wallet calls `account.revokePermission(permissionId)` via JAW SDK (triggers passkey prompt, on-chain tx)
3. On success: POST to `/api/subscriptions/revoke` with `{ subscriptionId }` → sets status to `revoked` in MongoDB
4. UI updates to show revoked status

### New API Routes (wallet/)

**`GET /api/subscriptions/mine`** — List user's subscriptions
- Query param: `address` (subscriber address)
- Returns all subscriptions where `subscriber` = address

**`POST /api/subscriptions/revoke`** — Mark subscription as revoked in DB
- Body: `{ subscriptionId }`
- Updates status to `revoked` in MongoDB (on-chain revocation already done by wallet)

## Out of Scope (Future)

- Automatic cron-based charging
- Multiple subscribers per subscription plan (currently 1:1)
- Email/notification on charge
- Charge history per subscription
