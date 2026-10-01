# Iso

Zero-knowledge proof that a lender's batch of algorithmic credit decisions meets a
demographic-parity fairness threshold — **without revealing the model or any applicant's data.**

Built for Monad Metropolis (Onchain Finance & Trading track).

## The problem

Lenders using algorithmic underwriting are increasingly required to prove their models aren't
discriminatory. Today that means handing the model and customer data over to an auditor. Iso
generates a zero-knowledge proof that a batch of lending decisions meets a fairness threshold —
verifiable by anyone, without revealing the model or any applicant's data. It's sold as
compliance tooling to lenders, not a lending product itself.

## How it works

1. A lender's batch of loan decisions (outcome + a protected-class proxy attribute) is fed into
   an SP1 zkVM guest program.
2. The guest program computes the demographic parity gap
   `|P(approve|group A) − P(approve|group B)|`, checks it against a threshold, and outputs a
   pass/fail bit plus a commitment hash of the batch — never the batch itself.
3. The proof is verified on-chain by [`FairnessRegistry.sol`](circuit/contracts/src/FairnessRegistry.sol),
   which records a `FairnessCertified` attestation if the batch passed.

## Repo layout

- `circuit/lib` — shared Rust types and the fairness-gap math (`compute_gap_bps`).
- `circuit/program` — the SP1 guest program (zkVM entrypoint).
- `circuit/script` — host-side driver: loads a CSV batch, runs `--execute`, `--prove` (core
  proof), `--evm` (Groth16 proof for on-chain verification), or `--vkey`.
- `circuit/contracts` — `FairnessRegistry.sol` (Foundry project) and its deploy script.
- `data/generate_dataset.py` — generates sample batches: a fair one (2.4% demographic parity
  gap, passes) and a biased one (48% gap, fails).
- `frontend` — Vite + React + TypeScript + viem dashboard: pick a batch, connect a wallet,
  certify fairness on-chain, see attestations read back live.

## Status

**Live on Monad testnet (chain 10143):**
- `SP1Verifier` (Groth16): `0xE1c500CcCf6B8B6649590BDfc0696ad3cd94c4bb`
- `FairnessRegistry`: `0xb06A8b7f9C922fD73745dB1980fd4ac85C98F33f`

A zero-knowledge Groth16 proof has been generated over the sample fair batch (240 bps
demographic parity gap, under the 1000 bps threshold, 500 records) and verified on-chain, with
the resulting attestation recorded and readable from the contract.

Test coverage: `cargo test` in `circuit/lib` passes 4/4 unit tests; the Foundry suite in
`circuit/contracts/test` passes 7/7 tests including a 256-run fuzz test.

## Running it

```sh
# regenerate the sample batches
python3 data/generate_dataset.py

# run the zkVM guest program
cd circuit/script
cargo run --release --bin fairness -- --execute --batch ../../data/fair_batch.csv --threshold-bps 1000

# run the Foundry tests
cd circuit/contracts
forge test

# run the frontend
cd frontend
npm install && npm run dev
```

Generating a Groth16 proof (`--evm`) needs roughly 16GB of RAM; `--execute` and `--prove`
(core proof) run comfortably on much less.

## Wallet

Deployer wallet used for the Monad testnet deployment above (testnet funds only, no real
value): `0x81F875dFb91E4fC42a7800f44d9Cf821f2f1D2cf`.
