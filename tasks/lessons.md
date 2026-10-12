# Lessons and verification notes

## S1 environment

- Repository started empty, with origin pointing to the user's Batchelor repository.
- Foundry is not on PATH. Host Node is 24; the project requires Node 22 and pnpm 9.
- External claims in the supplied source list require rechecking before being presented as measured facts.

## Toolchain source correction

Official Monad Foundry documentation now states that upstream Foundry v1.8+ supports MonadTen/MIP-8. The legacy Category Labs fork supports only MonadNine. Use upstream v1.8.0; do not use the supplied fallback installer for this spike. Source: https://docs.monad.xyz/tooling-and-infra/toolkits/foundry.md (rechecked during S1).
