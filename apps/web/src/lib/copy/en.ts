export const en = {
  brand: 'Batchelor',
  tagline: 'Every block, one price. No favorites.',
  nav: { trade: 'Trade', orders: 'My orders', proof: 'Proof' },
  skip: 'Skip to content',
  footer: 'Demo tokens on Monad mainnet. No real value.',
  stage: 'Development scaffold · No market connected',
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
    description: 'Storage measurements come first. Auction correctness and clearing gas follow.',
    storage: 'Storage spike',
    storageDetail: 'The local MonadNine and MonadTen comparison passed. Reproducible measurements are saved in the repository.',
    settlement: 'Settlement proofs',
    settlementDetail: 'Permutation, conservation, and solvency tests are scheduled for the auction implementation.',
    clearing: 'Auction clearing gas',
    clearingDetail: 'Not measured yet. A storage-read benchmark is not a clearing benchmark.',
    deployed: 'Deployment',
    deployedDetail: 'No contract addresses are configured.'
  }
} as const;
