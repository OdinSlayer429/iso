// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {SP1Verifier} from "@sp1-contracts/v6.1.0/SP1VerifierGroth16.sol";
import {FairnessRegistry} from "../src/FairnessRegistry.sol";

/// @notice Deploys the REAL SP1 Groth16 verifier (v6.1.0) and FairnessRegistry
/// pointed at the real program vkey -- no mock involved.
contract DeployReal is Script {
    bytes32 constant PROGRAM_VKEY = 0x00213e35f8a2c36f3277b411b2d33e2b0a523c2068bd8032f6293ffae77040f3;

    function run() external returns (SP1Verifier verifier, FairnessRegistry registry) {
        vm.startBroadcast();
        verifier = new SP1Verifier();
        registry = new FairnessRegistry(address(verifier), PROGRAM_VKEY);
        vm.stopBroadcast();

        console.log("Real SP1Verifier deployed at:", address(verifier));
        console.log("Real FairnessRegistry deployed at:", address(registry));
    }
}
