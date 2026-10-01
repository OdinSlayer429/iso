use alloy_sol_types::sol;
use serde::{Deserialize, Serialize};

sol! {
    /// Public outputs of the fairness proof: safe to reveal, reveals nothing about
    /// individual applicants or the underwriting model itself.
    #[allow(non_snake_case)]
    struct PublicValuesStruct {
        uint32 gapBps;
        uint32 thresholdBps;
        bool passed;
        bytes32 batchCommitment;
    }
}

/// One applicant's loan decision. `group` is a protected-class proxy attribute
/// (0 = group A, 1 = group B) -- never revealed on-chain, only used inside the zkVM
/// to compute the aggregate fairness statistic.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LoanRecord {
    pub group: u8,
    pub approved: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FairnessBatch {
    pub records: Vec<LoanRecord>,
}

/// Demographic parity gap = |P(approve | group A) - P(approve | group B)|,
/// expressed in basis points (0-10000) to avoid floating point inside the zkVM.
pub fn compute_gap_bps(batch: &FairnessBatch) -> u32 {
    let mut a_total: u32 = 0;
    let mut a_approved: u32 = 0;
    let mut b_total: u32 = 0;
    let mut b_approved: u32 = 0;

    for r in &batch.records {
        match r.group {
            0 => {
                a_total += 1;
                if r.approved {
                    a_approved += 1;
                }
            }
            _ => {
                b_total += 1;
                if r.approved {
                    b_approved += 1;
                }
            }
        }
    }

    let rate_a_bps = if a_total > 0 { (a_approved as u64 * 10_000 / a_total as u64) as u32 } else { 0 };
    let rate_b_bps = if b_total > 0 { (b_approved as u64 * 10_000 / b_total as u64) as u32 } else { 0 };
    rate_a_bps.abs_diff(rate_b_bps)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn batch_from(pairs: &[(u8, bool)]) -> FairnessBatch {
        FairnessBatch {
            records: pairs.iter().map(|&(group, approved)| LoanRecord { group, approved }).collect(),
        }
    }

    #[test]
    fn identical_rates_gap_zero() {
        let batch = batch_from(&[(0, true), (0, false), (1, true), (1, false)]);
        assert_eq!(compute_gap_bps(&batch), 0);
    }

    #[test]
    fn fully_biased_gap_10000() {
        let batch = batch_from(&[(0, true), (0, true), (1, false), (1, false)]);
        assert_eq!(compute_gap_bps(&batch), 10_000);
    }

    #[test]
    fn partial_gap_matches_expected_bps() {
        // Group A: 3/4 approved = 7500 bps. Group B: 1/4 approved = 2500 bps. Gap = 5000.
        let batch = batch_from(&[
            (0, true),
            (0, true),
            (0, true),
            (0, false),
            (1, true),
            (1, false),
            (1, false),
            (1, false),
        ]);
        assert_eq!(compute_gap_bps(&batch), 5_000);
    }

    #[test]
    fn empty_group_treated_as_zero_rate() {
        let batch = batch_from(&[(0, true), (0, true)]);
        assert_eq!(compute_gap_bps(&batch), 10_000);
    }
}
