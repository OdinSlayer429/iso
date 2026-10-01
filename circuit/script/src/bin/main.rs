//! Host-side driver: loads a CSV batch of loan decisions, runs it through the
//! fairness guest program, and executes, generates a core proof, generates a
//! real EVM-compatible (Groth16) proof, or prints the program's verification key.
use alloy_sol_types::SolType;
use clap::Parser;
use fairness_lib::{FairnessBatch, LoanRecord, PublicValuesStruct};
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, HashableKey, ProvingKey, SP1Stdin,
};
use std::path::PathBuf;

const FAIRNESS_ELF: Elf = include_elf!("fairness-program");

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(long)]
    execute: bool,
    #[arg(long)]
    prove: bool,
    #[arg(long)]
    evm: bool,
    #[arg(long)]
    vkey: bool,
    #[arg(long)]
    batch: Option<PathBuf>,
    #[arg(long, default_value = "1000")]
    threshold_bps: u32,
}

fn load_batch(path: &PathBuf) -> FairnessBatch {
    let mut reader = csv::Reader::from_path(path).expect("failed to open batch CSV");
    let mut records = Vec::new();
    for result in reader.records() {
        let record = result.expect("failed to read CSV row");
        let group = match &record[3] {
            "A" => 0u8,
            "B" => 1u8,
            other => panic!("unknown group label: {other}"),
        };
        let approved = &record[4] == "1";
        records.push(LoanRecord { group, approved });
    }
    FairnessBatch { records }
}

fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();

    let args = Args::parse();
    let client = ProverClient::from_env();

    if args.vkey {
        let pk = client.setup(FAIRNESS_ELF).expect("failed to setup elf");
        println!("program_vkey: {}", pk.verifying_key().bytes32());
        return;
    }

    let modes = [args.execute, args.prove, args.evm].iter().filter(|&&x| x).count();
    if modes != 1 {
        eprintln!("Error: specify exactly one of --execute, --prove, --evm");
        std::process::exit(1);
    }

    let batch_path = args.batch.expect("--batch is required");
    let batch = load_batch(&batch_path);
    println!("Loaded {} records from {}", batch.records.len(), batch_path.display());

    let mut stdin = SP1Stdin::new();
    stdin.write(&args.threshold_bps);
    stdin.write(&batch);

    if args.execute {
        let (output, report) = client.execute(FAIRNESS_ELF, stdin).run().unwrap();
        println!("Program executed successfully.");
        let decoded = PublicValuesStruct::abi_decode(output.as_slice()).unwrap();
        let PublicValuesStruct { gapBps, thresholdBps, passed, batchCommitment } = decoded;
        println!("gap_bps: {gapBps}");
        println!("threshold_bps: {thresholdBps}");
        println!("passed: {passed}");
        println!("batch_commitment: 0x{}", hex::encode(batchCommitment));
        println!("Number of cycles: {}", report.total_instruction_count());
    } else if args.prove {
        let pk = client.setup(FAIRNESS_ELF).expect("failed to setup elf");
        let proof = client.prove(&pk, stdin).run().expect("failed to generate proof");
        println!("Successfully generated core proof!");
        client.verify(&proof, pk.verifying_key(), None).expect("failed to verify proof");
        println!("Successfully verified proof!");
    } else {
        let pk = client.setup(FAIRNESS_ELF).expect("failed to setup elf");
        let proof = client.prove(&pk, stdin).groth16().run().expect("failed to generate groth16 proof");
        println!("Successfully generated groth16 (EVM) proof!");
        client.verify(&proof, pk.verifying_key(), None).expect("failed to verify proof");
        println!("Successfully verified proof!");
        println!("program_vkey: {}", pk.verifying_key().bytes32());
        println!("proof_bytes: 0x{}", hex::encode(proof.bytes()));
        println!("public_values: 0x{}", hex::encode(proof.public_values.as_slice()));
    }
}
