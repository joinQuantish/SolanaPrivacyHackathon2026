# Frontend Integration Guide

## Overview

This guide explains how to integrate with the Quantish Prediction Privacy Relay service for placing prediction market orders with multi-wallet distribution.

## Order Flow

```
1. User submits order with distribution plan
2. Frontend receives deposit instructions (address + memo)
3. User sends USDC with memo containing order ID
4. Relay detects deposit and activates order
5. Relay executes batch trade on DFlow
6. Shares distributed to user's specified wallets
7. ZK proof verifies correct distribution
```

## API Endpoints

### Submit Order

```typescript
POST /relay/order
Content-Type: application/json

{
  "marketId": "KXSB-26-SEA",
  "side": "YES",  // or "NO"
  "usdcAmount": "100.00",
  "distribution": [
    { "wallet": "WalletAddress1...", "percentage": 5000 },  // 50%
    { "wallet": "WalletAddress2...", "percentage": 3000 },  // 30%
    { "wallet": "WalletAddress3...", "percentage": 2000 }   // 20%
  ]
}
```

**Response:**

```typescript
{
  "success": true,
  "orderId": "abc123-uuid",
  "batchId": "batch-uuid",
  "commitmentHash": "12345...",
  "status": "pending_deposit",
  "distribution": [...],

  "deposit": {
    "address": "RelayWalletAddress...",
    "amount": "100.00",
    "memo": "abc123-uuid",  // CRITICAL: Include in transaction
    "expiresAt": "2024-01-12T02:00:00Z",
    "expiresInSeconds": 3600
  },

  "instructions": {
    "step1": "Send exactly 100.00 USDC to the deposit address",
    "step2": "Include the memo field with value: abc123-uuid",
    "step3": "Transaction will be detected automatically within ~30 seconds",
    "important": "The memo field is required for automatic matching."
  }
}
```

## Sending USDC with Memo

### Using @solana/web3.js + @solana/spl-token

```typescript
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

async function sendUsdcWithMemo(
  connection: Connection,
  wallet: any, // Wallet adapter
  depositAddress: string,
  amount: number,
  memo: string  // The order ID
) {
  const senderAta = await getAssociatedTokenAddress(
    USDC_MINT,
    wallet.publicKey
  );

  const recipientAta = await getAssociatedTokenAddress(
    USDC_MINT,
    new PublicKey(depositAddress)
  );

  // Create transfer instruction
  const transferIx = createTransferInstruction(
    senderAta,
    recipientAta,
    wallet.publicKey,
    amount * 1e6  // USDC has 6 decimals
  );

  // Create memo instruction
  const memoIx = new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, 'utf-8'),
  });

  // Build transaction with BOTH instructions
  const tx = new Transaction().add(transferIx).add(memoIx);

  // Send transaction
  const signature = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(signature);

  return signature;
}
```

### Using Phantom Wallet (Browser Extension)

```typescript
async function sendWithPhantom(
  depositAddress: string,
  amount: number,
  memo: string
) {
  const provider = window.solana;
  if (!provider?.isPhantom) {
    throw new Error('Phantom wallet not found');
  }

  // Connect if not connected
  await provider.connect();

  const connection = new Connection('https://api.mainnet-beta.solana.com');

  // Use the function above
  return sendUsdcWithMemo(
    connection,
    provider,
    depositAddress,
    amount,
    memo
  );
}
```

### Using Solana Wallet Adapter (React)

```tsx
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

function DepositButton({ orderId, depositAddress, amount }) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const handleDeposit = async () => {
    if (!wallet.publicKey) {
      alert('Please connect your wallet');
      return;
    }

    try {
      const signature = await sendUsdcWithMemo(
        connection,
        wallet,
        depositAddress,
        parseFloat(amount),
        orderId  // This is the memo!
      );

      console.log('Deposit sent:', signature);
      // Poll order status to check when it's activated
    } catch (error) {
      console.error('Deposit failed:', error);
    }
  };

  return (
    <button onClick={handleDeposit}>
      Send {amount} USDC
    </button>
  );
}
```

## Distribution Configuration

Users can split their shares across up to 10 wallets:

```typescript
// Percentages are in basis points (100 = 1%, 10000 = 100%)
const distribution = [
  { wallet: "MainWallet...", percentage: 7000 },   // 70%
  { wallet: "ColdStorage...", percentage: 2000 },  // 20%
  { wallet: "FriendWallet...", percentage: 1000 }, // 10%
];

// MUST sum to exactly 10000 (100%)
const total = distribution.reduce((sum, d) => sum + d.percentage, 0);
console.assert(total === 10000, 'Distribution must sum to 100%');
```

### Single Wallet (Simplified)

For users who want all shares to one wallet:

```typescript
// Option 1: Use distribution array
{
  "distribution": [
    { "wallet": "MyWallet...", "percentage": 10000 }
  ]
}

// Option 2: Use legacy field (converted automatically)
{
  "destinationWallet": "MyWallet..."
}
```

## Order Status Polling

```typescript
async function pollOrderStatus(orderId: string) {
  const response = await fetch(`/relay/order/${orderId}`);
  const data = await response.json();

  switch (data.order.status) {
    case 'pending_deposit':
      // Show "Waiting for deposit" UI
      break;
    case 'pending':
      // Deposit confirmed, waiting for batch
      break;
    case 'executing':
      // Trade in progress
      break;
    case 'completed':
      // Show success + distribution results
      console.log('Shares received:', data.order.sharesReceived);
      console.log('Distribution:', data.order.distributionResults);
      break;
    case 'refunded':
      // Show refund info
      console.log('Refund reason:', data.order.refundReason);
      break;
    case 'expired':
      // Deposit window expired
      break;
  }
}

// Poll every 5 seconds
const interval = setInterval(async () => {
  const status = await pollOrderStatus(orderId);
  if (['completed', 'refunded', 'expired', 'failed'].includes(status)) {
    clearInterval(interval);
  }
}, 5000);
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Distribution must sum to 10000" | Percentages don't add up to 100% | Fix percentage values |
| "Maximum 10 distribution destinations" | Too many wallets | Reduce to 10 or fewer |
| "Amount mismatch" | Sent wrong USDC amount | Send exact amount specified |
| "Order expired" | Deposit took too long | Submit new order |
| "Memo not found" | Missing memo in transaction | Resend with memo |

### Handling Mismatched Deposits

If a user sends the wrong amount or forgets the memo:
1. Relay holds the deposit for manual review
2. Admin can manually match or refund
3. User can contact support with transaction signature

## Security Notes

1. **Never expose private keys** - All signing happens in user's wallet
2. **Verify deposit address** - Always confirm it matches the API response
3. **Include memo** - Without memo, deposits require manual matching
4. **Check expiration** - Submit deposits before expiry time
5. **Distribution is committed** - Once submitted, distribution cannot be changed

## Example: Complete Order Flow

```typescript
async function placeOrder(
  marketId: string,
  side: 'YES' | 'NO',
  amount: number,
  wallets: { address: string; percent: number }[]
) {
  // 1. Convert to basis points
  const distribution = wallets.map(w => ({
    wallet: w.address,
    percentage: w.percent * 100  // 50% -> 5000
  }));

  // 2. Submit order
  const orderResponse = await fetch('/relay/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      marketId,
      side,
      usdcAmount: amount.toString(),
      distribution
    })
  });

  const { orderId, deposit } = await orderResponse.json();

  // 3. Send USDC with memo
  const txSignature = await sendUsdcWithMemo(
    connection,
    wallet,
    deposit.address,
    parseFloat(deposit.amount),
    deposit.memo  // orderId
  );

  // 4. Wait for activation
  let status = 'pending_deposit';
  while (status === 'pending_deposit') {
    await sleep(5000);
    const statusResponse = await fetch(`/relay/order/${orderId}`);
    const data = await statusResponse.json();
    status = data.order.status;
  }

  // 5. Wait for completion
  while (!['completed', 'refunded', 'failed'].includes(status)) {
    await sleep(5000);
    const statusResponse = await fetch(`/relay/order/${orderId}`);
    const data = await statusResponse.json();
    status = data.order.status;
  }

  return status;
}
```

## Testing

Use devnet for testing:
- Set `SOLANA_RPC_URL=https://api.devnet.solana.com`
- Use devnet USDC faucet for test tokens
- All functionality works the same as mainnet
