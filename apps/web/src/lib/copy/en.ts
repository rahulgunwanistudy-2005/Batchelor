export const en = {
  brand: 'Batchelor',
  tagline: 'Every block, one price. No favorites.',
  nav: { trade: 'Trade', orders: 'My orders', proof: 'Proof' },
  skip: 'Skip to content',
  footer: 'Demo tokens on Monad mainnet. No real value.',
  stage: 'Every block, one clearing price',
  wallet: {
    PRF_UNAVAILABLE: "Passkey couldn't create a key on this browser. Save the passkey to Google Password Manager or iCloud Keychain, then try again.",
    PASSKEY_OPERATION_FAILED: 'Passkey operation was cancelled or failed. Try again.',
    CRYPTO_UNAVAILABLE: 'Passkeys need HTTPS. Open the secure Batchelor address, then try again.',
    SESSION_ENDED: 'Your signing session expired. Sign in with your passkey again.'
  },
  trade: {
    title: 'One batch. One clearing price.',
    description: 'Buy and sell orders in the same block meet at a single price.',
    market: 'ROSE / dUSD',
    book: 'The next batch starts here',
    empty: 'The order book will appear when a market is connected.',
    demand: 'Buy orders', supply: 'Sell orders',
    ticket: 'Your order',
    ticketDescription: 'Choose a side, a limit price, and an amount when trading is enabled.',
    buy: 'Buy ROSE', sell: 'Sell ROSE',
    notReady: 'Trading is not ready yet',
    next: 'Contract execution and passkey sign-in are scheduled for the next build sessions.',
    fairness: 'Within a batch, order arrival time does not set the clearing price.',
    receipt: 'Each cleared batch will have a shareable receipt.'
  },
  orders: {
    title: 'My orders',
    description: 'Your balances, open orders, and fills will be collected here.',
    empty: 'No account connected',
    detail: 'Passkey sign-in and real order history are not available in this scaffold.'
  },
  receipt: {
    title: 'Batch receipt',
    description: 'A cleared batch will show one price, the orders, and their fills.',
    empty: 'No receipt available',
    detail: 'This market has not been deployed. No batch data is connected.'
  },
  proof: {
    title: 'The mechanism, measured.',
    description: 'Auction clearing measured locally and confirmed on Monad testnet.',
    storage: 'Storage spike',
    storageDetail: 'The local MonadNine and MonadTen comparison passed. Reproducible measurements are saved in the repository.',
    settlement: 'Settlement proofs',
    settlementDetail: 'Independent reference, permutation, rounding, conservation, and solvency tests cover the auction core.',
    clearing: 'Auction clearing gas',
    clearingDetail: 'Cold-call benchmarks include dense and sparse books, signed orders, and partial claims. Live market statistics will appear when indexing is connected.',
    deployed: 'Deployment',
    deployedDetail: 'The benchmark market is deployed on Monad testnet. Production trading and mainnet deployment remain unconfigured.'
  }
} as const;
