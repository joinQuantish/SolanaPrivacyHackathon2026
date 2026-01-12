use poseidon::poseidon::bn254::{hash_2, hash_5};

#[test]
fn test_hash_values() {
    // Same values as TypeScript test
    let h5 = hash_5([1, 1, 1000000, 12345, 999]);
    println(h5);
    
    let h2 = hash_2([123, 456]);
    println(h2);
}
