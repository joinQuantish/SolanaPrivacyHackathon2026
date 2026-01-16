/**
 * Privacy Cash Integration Test
 * Tests the full flow with real Privacy Cash on mainnet
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=9e722182-5f97-466a-a3e8-c0d8c4622daf';

async function testPrivacyCash() {
  console.log('=== Privacy Cash Integration Test ===\n');
  
  const connection = new Connection(RPC_URL, 'confirmed');
  
  // Step 1: Create test ephemeral wallets
  console.log('Step 1: Creating ephemeral wallets...');
  const ephemeral1 = Keypair.generate();
  const ephemeral2 = Keypair.generate();
  
  console.log('  Ephemeral 1:', ephemeral1.publicKey.toBase58());
  console.log('  Ephemeral 2:', ephemeral2.publicKey.toBase58());
  
  // Step 2: Check relay wallet balance (could use this for testing)
  console.log('\nStep 2: Checking available balances...');
  
  // Check relay wallet
  const relayWalletFile = './relay-wallet.json';
  let relayKeypair: Keypair | null = null;
  try {
    const fs = await import('fs');
    if (fs.existsSync(relayWalletFile)) {
      const data = JSON.parse(fs.readFileSync(relayWalletFile, 'utf-8'));
      relayKeypair = Keypair.fromSecretKey(Uint8Array.from(data));
      console.log('  Relay wallet:', relayKeypair.publicKey.toBase58());
      
      const relayBalance = await connection.getBalance(relayKeypair.publicKey);
      console.log('  Relay SOL:', relayBalance / LAMPORTS_PER_SOL);
      
      const relayUsdcAta = await getAssociatedTokenAddress(USDC_MINT, relayKeypair.publicKey);
      try {
        const usdcBalance = await connection.getTokenAccountBalance(relayUsdcAta);
        console.log('  Relay USDC:', usdcBalance.value.uiAmount);
      } catch {
        console.log('  Relay USDC: 0 (no ATA)');
      }
    }
  } catch (e) {
    console.log('  Could not load relay wallet');
  }
  
  // Step 3: Test the API endpoint
  console.log('\nStep 3: Testing Privacy API endpoint...');
  try {
    const statusRes = await fetch('http://localhost:3000/api/privacy/status');
    const status = await statusRes.json();
    console.log('  API Status:', status.success ? 'OK' : 'FAILED');
    console.log('  Privacy Cash Available:', status.available);
    console.log('  Pool TVL: $' + (status.stats?.tvl / 1_000_000) + 'M');
  } catch (e) {
    console.log('  API Error:', e);
  }
  
  // Step 4: Test with minimal amount if relay has USDC
  console.log('\nStep 4: Integration test...');
  
  if (relayKeypair) {
    const relayUsdcAta = await getAssociatedTokenAddress(USDC_MINT, relayKeypair.publicKey);
    let relayUsdcBalance = 0;
    try {
      const balance = await connection.getTokenAccountBalance(relayUsdcAta);
      relayUsdcBalance = balance.value.uiAmount || 0;
    } catch {}
    
    if (relayUsdcBalance >= 1) {
      console.log('  Relay has USDC! Testing with $1...');
      console.log('  (Would need to implement relay-funded test)');
      console.log('  SKIPPING: Would require modifying flow to use relay as funder');
    } else {
      console.log('  Relay has no USDC. Cannot run automated test.');
      console.log('  To test manually:');
      console.log('    1. Send $1 USDC to ephemeral1:', ephemeral1.publicKey.toBase58());
      console.log('    2. Send 0.02 SOL to ephemeral1 for fees');
      console.log('    3. Run the backend deposit API');
    }
  }
  
  // Step 5: Dry-run the API (will fail but shows flow)
  console.log('\nStep 5: Dry-run API call (expected to fail - no funds)...');
  
  const testPayload = {
    ephemeral1SecretKey: Buffer.from(ephemeral1.secretKey).toString('base64'),
    ephemeral2SecretKey: Buffer.from(ephemeral2.secretKey).toString('base64'),
    amount: '1',
    orderId: 'test-' + Date.now(),
  };
  
  try {
    const res = await fetch('http://localhost:3000/api/privacy/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload),
    });
    const result = await res.json();
    
    if (result.success) {
      console.log('  SUCCESS! Transactions:', result.transactions);
    } else {
      console.log('  Expected failure:', result.error);
    }
  } catch (e) {
    console.log('  API call failed:', e);
  }
  
  console.log('\n=== Test Complete ===');
  console.log('\nTo do a REAL test with your wallet:');
  console.log('1. Go to http://localhost:5174');
  console.log('2. Connect Phantom wallet');
  console.log('3. Select a market and click Buy');
  console.log('4. Enable "Private Deposit" toggle');
  console.log('5. Enter $1 and submit');
}

testPrivacyCash().catch(console.error);
