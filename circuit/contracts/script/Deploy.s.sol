// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {FairnessRegistry} from "../src/FairnessRegistry.sol";

/// @notice Deploys FairnessRegistry pointed at an already-deployed SP1 verifier gateway.
/// Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url https://testnet-rpc.monad.xyz \
///     --account parityproof-deployer \
///     --broadcast \
///     --sig "run(address,bytes32)" <VERIFIER_ADDRESS> <PROGRAM_VKEY>
contract Deploy is Script {
    function run(address verifier, bytes32 programVKey) external returns (FairnessRegistry registry) {
        vm.startBroadcast();
        registry = new FairnessRegistry(verifier, programVKey);
        vm.stopBroadcast();

        console.log("FairnessRegistry deployed at:", address(registry));
    }
}
