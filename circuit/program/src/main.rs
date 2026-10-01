//! Guest program: given a private batch of loan decisions and a fairness threshold,
//! proves that the demographic parity gap is within the threshold -- without revealing
//! the batch contents. Public output is just the gap, pass/fail, and a commitment hash
//! of the input batch (so the proof is tied to one specific, auditable dataset).
#![no_main]
sp1_zkvm::entrypoint!(main);

use alloy_sol_types::SolType;
use fairness_lib::{compute_gap_bps, FairnessBatch, PublicValuesStruct};
use sha2::{Digest, Sha256};

pub fn main() {
    let threshold_bps = sp1_zkvm::io::read::<u32>();
    let batch = sp1_zkvm::io::read::<FairnessBatch>();

    // Commit to the batch content without revealing it: hash the same bytes the
    // host serialized onto stdin, re-encoded deterministically from the decoded value.
    let encoded = bincode::serialize(&batch).expect("serialize batch for commitment");
    let digest = Sha256::digest(&encoded);
    let mut batch_commitment = [0u8; 32];
    batch_commitment.copy_from_slice(&digest);

    let gap_bps = compute_gap_bps(&batch);
    let passed = gap_bps <= threshold_bps;

    let public_values = PublicValuesStruct {
        gapBps: gap_bps,
        thresholdBps: threshold_bps,
        passed,
        batchCommitment: batch_commitment.into(),
    };
    let bytes = PublicValuesStruct::abi_encode(&public_values);
    sp1_zkvm::io::commit_slice(&bytes);
}
