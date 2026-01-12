import { poseidon2, poseidon5 } from 'poseidon-lite';

// Test with same values as Noir circuit test
const commitment = {
  market_id: 1n,
  side: 1n,
  usdc_amount: 1000000n,
  destination_wallet: 12345n,
  salt: 999n
};

const hash = poseidon5([
  commitment.market_id,
  commitment.side,
  commitment.usdc_amount,
  commitment.destination_wallet,
  commitment.salt
]);

console.log("poseidon-lite hash_5:", hash.toString());

// Test hash_2
const h2 = poseidon2([123n, 456n]);
console.log("poseidon-lite hash_2:", h2.toString());
