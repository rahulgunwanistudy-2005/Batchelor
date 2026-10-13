# AI assistance disclosure

OpenAI **Codex** was used as the coding agent under Rahul's direction. The product itself uses **no AI at runtime**: auction, signing, settlement, indexing, replay and charts use deterministic code.

| Component | Codex assistance | Verification |
|---|---|---|
| Solidity auction, tokens, faucet and storage layout | Drafted implementation and tests from the supplied mechanism/build pack; optimized bounded loops and packing | Independent reference auction, permutation fuzzing, rational settlement tests, handler invariants, malicious token callbacks, storage/opcode gates and individually reviewed Slither findings |
| Shared TypeScript | Drafted uncrossing, settlement, EIP-712, replay, formatting, generated ABI/gas access | Solidity golden vectors, signature/domain/nonce tests and bigint replay property tests |
| Web and Mera account layer | Drafted passkey/session integration, endpoints, pages, SVG charts, receipts, PNG cards, CSP and recovery copy | Installed SDK source/declarations, mocked ceremonies, local real-chain endpoint execution, browser accessibility/responsive checks; physical PRF/provider validation pending |
| Bots and Envio | Drafted keeper/Mo/Pete, control surface, nonce/recovery logic, indexer schema/handlers | Unit tests, local chain rehearsals, actual Envio mock-event handlers and historical testnet replay; hosted operation pending |
| Build/verification/docs | Drafted scripts, gas benchmarks, CI, runbooks, diagrams and submission copy | Reproducible measured artifacts, source hashes and local quality gates; external submission facts require dashboard confirmation |

Rahul supplied the project bible specifying the uncrossing rules, rounding scheme, invariants and page layout. Those specifications drive the implementation and review. **Rahul's independent line-by-line approval of these areas and benchmarks is a pending release sign-off**, not established by the automated tests or by this document. The build pack's suggested statement that every item has already been personally checked must only be used after that review actually occurs.

The repository was recorded as empty before S1; original project code was authored during the recorded 12–13 October 2026 build. Third-party code is reused: OpenZeppelin and forge-std (MIT), viem (MIT), Mera (MIT OR Apache-2.0), Svelte/SvelteKit (MIT), Hono (MIT), Zod (MIT), Tailwind (MIT), and scure libraries (MIT). Installed Envio 3.14.0 declares `SEE LICENSE IN licenses/README.md`; its bundled licensing documentation expressly says it is not OSI recognized and distinguishes generator/generated-code terms. It must not be described as MIT. Bricolage Grotesque and IBM Plex Sans font assets retain their SIL Open Font License notices. Check exact installed dependency/submodule licenses before redistributing bundles; those licenses are not replaced by the project's MIT license.

See [commit-window evidence](verification/s8-commits.json) and [release status](S8_REPORT.md). AI assistance is disclosed in the README too. No unverified human review, public deployment or submission result is asserted here.
