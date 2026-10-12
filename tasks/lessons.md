# Lessons and verification notes

## S1 environment

- Repository started empty, with origin pointing to the user's Batchelor repository.
- Foundry is not on PATH. Host Node is 24; the project requires Node 22 and pnpm 9.
- External claims in the supplied source list require rechecking before being presented as measured facts.

## Toolchain source correction

Official Monad Foundry documentation now states that upstream Foundry v1.8+ supports MonadTen/MIP-8. The legacy Category Labs fork supports only MonadNine. Use upstream v1.8.0; do not use the supplied fallback installer for this spike. Source: https://docs.monad.xyz/tooling-and-infra/toolkits/foundry.md (rechecked during S1).

## Local spike

- Official Foundry v1.8.0, commit `61ae26af36320d4fa1020f7db53785885e29eeb5`; downloaded binaries verified by foundryup against the release attestation.
- Resolved default: `network=monad`, `hardfork=monad:MonadTen`; pre_mip8: `network=monad`, `hardfork=monad:MonadNine`.
- Same runtime bytecode across both profiles. `scripts/spike.py` checks hashes and refuses to proceed below 10x.
- 512 contiguous reads: MonadNine 4,226,086 gas; MonadTen 162,086 gas; 26.0731x. Includes Solidity loop/bounds/checksum work inside the measured call; these are not bare SLOAD sums or auction clearing gas.
- OZ 5.4.0 ReentrancyGuardTransient blocks reentrancy and releases its lock within the same transaction under both hardforks.
- `vm.cool` on a freshly deployed contract in setUp made that contract appear empty in the isolated next transaction under this toolchain. It is redundant: Foundry's default `isolate=true` gives the measured external call a fresh transaction/access set. Removed the redundant hook; the cold-read deltas match the page/slot gas difference exactly (4,064,000 gas).
- Mera 0.2.0 declaration: `toViemAccount(session: Secp256k1SigningSession, options?: ToViemAccountOptions): LocalAccount<"mera">`. Its declared methods include EIP-712 `signTypedData`. This confirms the adapter interface, not browser PRF/onboarding behavior.
