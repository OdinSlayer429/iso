// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SP1MockVerifier} from "@sp1-contracts/SP1MockVerifier.sol";
import {FairnessRegistry, PublicValuesStruct} from "../src/FairnessRegistry.sol";

contract FairnessRegistryTest is Test {
    SP1MockVerifier verifier;
    FairnessRegistry registry;
    bytes32 constant VKEY = bytes32(uint256(1));

    address lenderA = address(0xA11CE);
    address lenderB = address(0xB0B);

    function setUp() public {
        verifier = new SP1MockVerifier();
        registry = new FairnessRegistry(address(verifier), VKEY);
    }

    function _publicValues(uint32 gapBps, uint32 thresholdBps, bool passed, bytes32 commitment)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(PublicValuesStruct(gapBps, thresholdBps, passed, commitment));
    }

    function test_constructor_rejectsZeroVerifier() public {
        vm.expectRevert("FairnessRegistry: zero verifier address");
        new FairnessRegistry(address(0), VKEY);
    }

    function test_certifyFairness_recordsAttestation_whenPassed() public {
        bytes32 commitment = keccak256("fair-batch");
        vm.prank(lenderA);
        (uint32 gapBps, uint32 thresholdBps, bytes32 returnedCommitment) =
            registry.certifyFairness(_publicValues(240, 1000, true, commitment), "");

        assertEq(gapBps, 240);
        assertEq(thresholdBps, 1000);
        assertEq(returnedCommitment, commitment);
        assertEq(registry.attestationCount(), 1);

        (address lender, bytes32 storedCommitment, uint32 storedGap, uint32 storedThreshold,) =
            registry.attestations(0);
        assertEq(lender, lenderA);
        assertEq(storedCommitment, commitment);
        assertEq(storedGap, 240);
        assertEq(storedThreshold, 1000);
    }

    function test_certifyFairness_reverts_whenNotPassed() public {
        bytes32 commitment = keccak256("biased-batch");
        vm.expectRevert("FairnessRegistry: batch did not pass the fairness threshold");
        registry.certifyFairness(_publicValues(4800, 1000, false, commitment), "");
        assertEq(registry.attestationCount(), 0);
    }

    function test_certifyFairness_reverts_onNonEmptyMockProof() public {
        // SP1MockVerifier only accepts proofBytes.length == 0.
        vm.expectRevert();
        registry.certifyFairness(_publicValues(240, 1000, true, keccak256("x")), hex"00");
    }

    function test_certifyFairness_emitsEvent() public {
        bytes32 commitment = keccak256("fair-batch-2");
        vm.expectEmit(true, true, false, true, address(registry));
        emit FairnessRegistry.FairnessCertified(address(this), commitment, 100, 1000, block.timestamp);
        registry.certifyFairness(_publicValues(100, 1000, true, commitment), "");
    }

    function test_multipleLenders_recordIndependentAttestations() public {
        vm.prank(lenderA);
        registry.certifyFairness(_publicValues(100, 1000, true, keccak256("a")), "");

        vm.prank(lenderB);
        registry.certifyFairness(_publicValues(200, 1000, true, keccak256("b")), "");

        assertEq(registry.attestationCount(), 2);
        (address l0,,,,) = registry.attestations(0);
        (address l1,,,,) = registry.attestations(1);
        assertEq(l0, lenderA);
        assertEq(l1, lenderB);
    }

    function testFuzz_certifyFairness_passesIffGapWithinThreshold(uint32 gapBps, uint32 thresholdBps) public {
        bool shouldPass = gapBps <= thresholdBps;
        bytes memory values = _publicValues(gapBps, thresholdBps, shouldPass, keccak256("fuzz"));

        if (shouldPass) {
            registry.certifyFairness(values, "");
            assertEq(registry.attestationCount(), 1);
        } else {
            vm.expectRevert("FairnessRegistry: batch did not pass the fairness threshold");
            registry.certifyFairness(values, "");
        }
    }
}
