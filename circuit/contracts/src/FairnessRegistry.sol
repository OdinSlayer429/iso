// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISP1Verifier} from "@sp1-contracts/ISP1Verifier.sol";

struct PublicValuesStruct {
    uint32 gapBps;
    uint32 thresholdBps;
    bool passed;
    bytes32 batchCommitment;
}

/// @title FairnessRegistry
/// @notice Accepts a zero-knowledge proof that a lender's batch of loan decisions meets a
/// demographic-parity fairness threshold, and records an on-chain attestation -- without the
/// lender's underwriting model or any applicant's data ever being revealed, on-chain or off.
contract FairnessRegistry {
    address public immutable verifier;
    bytes32 public immutable fairnessProgramVKey;

    struct Attestation {
        address lender;
        bytes32 batchCommitment;
        uint32 gapBps;
        uint32 thresholdBps;
        uint256 timestamp;
    }

    Attestation[] public attestations;

    event FairnessCertified(
        address indexed lender,
        bytes32 indexed batchCommitment,
        uint32 gapBps,
        uint32 thresholdBps,
        uint256 timestamp
    );

    constructor(address _verifier, bytes32 _fairnessProgramVKey) {
        require(_verifier != address(0), "FairnessRegistry: zero verifier address");
        verifier = _verifier;
        fairnessProgramVKey = _fairnessProgramVKey;
    }

    /// @notice Verifies a fairness proof and records an attestation if the batch passed.
    /// Reverts on an invalid proof, or if the program itself reports a failing batch --
    /// a failing batch is never recorded as a certification.
    function certifyFairness(bytes calldata _publicValues, bytes calldata _proofBytes)
        external
        returns (uint32 gapBps, uint32 thresholdBps, bytes32 batchCommitment)
    {
        ISP1Verifier(verifier).verifyProof(fairnessProgramVKey, _publicValues, _proofBytes);

        PublicValuesStruct memory values = abi.decode(_publicValues, (PublicValuesStruct));
        require(values.passed, "FairnessRegistry: batch did not pass the fairness threshold");

        attestations.push(
            Attestation({
                lender: msg.sender,
                batchCommitment: values.batchCommitment,
                gapBps: values.gapBps,
                thresholdBps: values.thresholdBps,
                timestamp: block.timestamp
            })
        );

        emit FairnessCertified(msg.sender, values.batchCommitment, values.gapBps, values.thresholdBps, block.timestamp);

        return (values.gapBps, values.thresholdBps, values.batchCommitment);
    }

    function attestationCount() external view returns (uint256) {
        return attestations.length;
    }
}
