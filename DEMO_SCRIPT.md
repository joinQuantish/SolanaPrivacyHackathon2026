# Quantish Prediction Relay - Demo Script

## SEGMENT 1: THE PROBLEM (30 seconds)

Open the app. Before connecting a wallet, you're on the landing page:

- **"Private Prediction Markets"** hero section
- The 3-step flow: Connect Wallet -> Choose Market -> Buy Privately
- Briefly explain: "Prediction markets today have a problem -- every trade you make is linked to your wallet on-chain. Anyone can see what you're betting on, how much, and when. The Quantish Prediction Relay solves this with three independent privacy layers."

---

## SEGMENT 2: CONNECT + SHOW DASHBOARD (20 seconds)

- Click **"Connect Phantom to Start"**
- Phantom popup -> approve
- Dashboard appears showing:
  - Your wallet address, SOL balance, USDC balance
  - **Privacy Info Banner** explaining how Privacy Mode works
  - **Privacy Wallets** section (expand it) -- show the sub-wallets that receive shares. These are NOT linked to your main wallet on-chain.

**Say:** "I've got sub-wallets set up. These are the destination wallets that will receive my shares -- they have no on-chain link to my identity."

---

## SEGMENT 3: BROWSE MARKETS + OPEN BUY MODAL (20 seconds)

- Scroll to **"Choose a Market"**
- Search for a market (e.g., "bitcoin") or browse the list
- Markets show YES/NO prices, event cards are expandable
- Click **"Buy Yes"** on a market

The **BuyModal** opens with:
- Market info at top
- YES/NO position toggle with current prices
- Amount input with your USDC balance shown
- **Privacy Mode toggle** (prominent)
- **ZK Balance Proof toggle** (if you have private balance)

---

## SEGMENT 4: STANDARD FLOW -- THE BASELINE (30 seconds)

First, show the **standard flow** (Privacy Mode OFF):

- Enter an amount like `$10`
- Show the estimate: shares, price, slippage
- Note at bottom: "Transaction includes memo with order details for relay processing"

**Say:** "In standard mode, I send USDC to the relay with a plaintext memo. The relay batches my order with others trading the same side, executes one aggregate trade on DFlow/Kalshi, then distributes shares proportionally. But the memo is visible on-chain -- anyone can see my market, side, and amount."

Don't execute this one. Cancel.

---

## SEGMENT 5: PRIVACY CASH -- HIDING WHO (45 seconds)

Click **Buy Yes** again. Toggle **Privacy Mode ON**.

The modal expands to show:
- **Cost breakdown**: Privacy Cash fee (0.35%), SOL costs
- **Destination Wallet selector**: checkboxes for your sub-wallets
- Select 2 sub-wallets -> shows **Distribution Preview** (e.g., "Wallet A: ~5.25 shares, Wallet B: ~5.25 shares")

**Say:** "Privacy Mode uses Privacy Cash -- a ZK shielded pool. Here's what happens: my main wallet deposits USDC into the pool. A completely new, unlinked wallet withdraws from the pool and sends the order to the relay. There is no on-chain connection between my identity and this trade. I can even split shares across multiple sub-wallets."

Execute the privacy order. Show the 4-step progress:
1. Create Temp Wallet
2. Deposit to ZK Pool
3. Withdraw & Trade
4. Complete

Success screen shows:
- "Privacy deposit complete! There is NO on-chain link between your wallet and this order."
- **zkNoir Verification** section with proof status polling
- Solscan link

**Say:** "Privacy Cash solves the first layer -- hiding WHO is trading."

---

## >>> ARCIUM CALLOUT #1: WHERE IT WOULD PLUG IN <<<

**Say:** "But there's still a problem. The relay received this order. Even though it doesn't know WHO sent it, the relay itself can still see HOW MUCH I'm trading. The memo says buy_yes, $10. That's where Arcium MPC comes in."

"With Arcium, the order would never arrive as plaintext. Instead, the client encrypts the amount and destination wallet using x25519 key exchange against the Arcium MXE public key. The relay receives an opaque ciphertext blob. It can see the market and side -- it needs those for batching -- but the amount and destination wallet are encrypted. The relay literally cannot read them."

"The Arcium MPC nodes -- at least 3 of them -- collectively decrypt the orders inside a secure multi-party computation. No single node ever sees the plaintext. They compute the batch total, the relay executes a single aggregate trade on DFlow, and then the MPC computes distribution instructions -- which wallets get how many shares -- without the relay ever knowing individual positions."

---

## SEGMENT 6: SHOW THE ARCIUM TAB (30 seconds)

Switch to the **"Arcium MPC (Devnet)"** tab at the top.

- Shows MPC Status Card with connection diagnostics
- Demo market: "Will BTC reach $100,000?"
- Enter an amount, pick YES

Click **"Encrypt Preview"** -- this shows the encrypted order:
- `ciphertext` (base64 blob)
- `ephemeralPubkey`
- `nonce`
- `marketId` (plaintext -- relay needs this)
- `side` (plaintext -- relay needs this)

**Say:** "This is what the relay sees. The ciphertext is the encrypted amount and destination. The relay stores this and passes it to the MPC network. It cannot decrypt it -- only the Arcium MPC nodes can, collectively."

---

## >>> ARCIUM CALLOUT #2: CURRENT STATE <<<

**Say:** "We have the Anchor program deployed on Solana devnet with 4 computation definitions registered -- init_batch, add_to_batch, reveal_batch_total, and compute_distribution. The MXE is initialized on cluster 1. The client-side encryption is working with real x25519 against the MXE public key. What's blocking us is Arcium's devnet cluster -- we need 3 active nodes for MPC computation, and currently only 1 node is active. Our code is fully deployed and ready; we're waiting on Arcium infrastructure."

---

## SEGMENT 7: NOIR ZK PROOF -- KEEPING US HONEST (40 seconds)

Go back to the mainnet tab. Show a completed batch (or explain using the success screen's proof status card).

**Say:** "The third layer is Noir ZK proofs. After the relay executes a batch trade and distributes shares, it generates a zero-knowledge proof using an Aztec Noir circuit. The proof verifies six constraints:"

1. Every order's commitment hash matches (no tampering)
2. Every commitment exists in the Merkle tree (no fake orders)
3. All orders are for the same market and side (no mixing)
4. Distribution matches what was promised (no stealing)
5. Shares are proportional: `shares_i * total_usdc == usdc_i * total_shares` (fair allocation)
6. Totals add up (no inflation)

"Anyone can verify this proof at our public /verify endpoint. The proof reveals NOTHING about individual orders -- no amounts, no wallets, no salts. It just proves the relay was honest."

---

## >>> ARCIUM CALLOUT #3: HOW THEY WORK TOGETHER <<<

**Say:** "These three layers are completely independent and stack:"

- **Privacy Cash** hides **WHO** is trading (wallet unlinkability)
- **Arcium MPC** hides **HOW MUCH** each person is trading (amount encryption)
- **Noir ZK Proofs** prove the relay **DIDN'T CHEAT** (verifiable honesty)

"Without Arcium, the relay can see individual amounts. With Arcium, the relay is fully blind -- it doesn't know who's trading, how much they're trading, or where the shares go. It just executes what the MPC tells it to. And the Noir proof guarantees it did so correctly."

---

## SEGMENT 8: WRAP UP (15 seconds)

Show the Solscan transaction from the privacy order. Show the deposit monitor logs in the terminal (backend output showing it picked up the deposit and auto-processed it).

**Say:** "The relay is live. Privacy Cash is working on mainnet. Arcium MPC is deployed to devnet, client encryption is working, and we're waiting on cluster node availability for the full round trip. The Noir circuits are compiled and proving."
