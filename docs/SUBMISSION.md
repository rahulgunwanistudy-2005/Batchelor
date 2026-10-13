# Batchelor submission draft

**Not submitted.** Fields below require actual public release evidence. The user supplied the portal rules v3.0. Eligibility and sponsor-specific requirements still require the participant’s own confirmation.

**Name:** Batchelor  
**One-liner:** Every block, one price. No favorites.  
**Proposed track:** Onchain Finance & Trading  
**App:** [[actual permanent HTTPS URL]]  
**Code:** https://github.com/rahulgunwanistudy-2005/Batchelor — [[reviewed release branch / commit]]  
**Demo:** [[actual public video URL]]

Batchelor is a fully onchain frequent batch auction. Accepted orders in a block are cleared at a uniform price, with price priority and pro-rata cutoffs determining quantities. The matching contract does not use transaction ordering or priority fees as allocation inputs; fees may still affect inclusion and which batch an order reaches.

Monad's page-based storage makes a per-block clearing scan affordable. With identical production bytecode, the full 256-tick-per-side book measured 4,436,713 clearing gas under MonadNine and 342,713 under MonadTen, a 12.946× reduction. These are controlled Foundry measurements, not a production live median. The Proof page describes the measurements and correctness checks.

The judge flow uses a Mera passkey, demo-token faucet and sponsored signed intents. Envio HyperIndex drives public receipts, transaction/priority lanes, balances/history and a clearly labelled hypothetical continuous-book replay. The recorded receipt [[URL]] contains the actual person/Pete orders [[hashes]] in batch [[ID]]. Fill these fields only after a successful hosted demonstration.

Single market, single-batch orders, worthless demo tokens and labelled demonstration bots. No real-asset trading, resting orders, token fees or production reliability claim. The initial use case is token-opening auctions and long-tail markets.

**Deployments:** Monad testnet, chain 10143. BatchAuction `0x2B74dA5CD3fae739D952cbA6D93DCfba5832Ff45`; ROSE `0x5C82Cff303A6Ab6760d98aB91D6B7cC150dD5F08`; dUSD `0xC1FF70231914808fbE51c03308542FBc81bdB077`; Faucet `0xAd20E8A597D1FEE68f74057eDDBf4CAEa408c98E`. [Mined receipts](verification/testnet-deployment.json).  
**Source verification:** All four contracts have exact creation/runtime matches on Sourcify; per-contract public confirmation links are in [verification evidence](verification/testnet-deployment.json).  
**Monad explanation:** [docs/WHY_MONAD.md](WHY_MONAD.md)  
**AI disclosure:** OpenAI Codex assisted with code, tests, UI, tooling and documentation under Rahul's direction. No AI runs inside the product. Do not claim Rahul's independent review until it occurs. See [component disclosure](AI_DISCLOSURE.md).  
**License:** project code MIT; third-party terms retained.

Select Mera/Envio bounties only after confirming current requirements and proving the hosted integrations. The supplied rules require public GitHub source with an OSI-approved license and AI disclosure; the public demo video must be no longer than three minutes and show actual Monad interactions. Verify all app/video/code links without authentication and retain the portal's submitted confirmation.
