import { batchAuctionAbi, faucetAbi } from '@batchelor/core/abi';
import { addresses } from '@batchelor/core/addresses';
import type { Address, Block } from 'viem';
import { parseGwei } from 'viem';
import { ChainWriter, createChainClients, keyNames } from './chain.js';
import type { BotEnv, KeyName, OrderCall } from './chain.js';
import { createConductor } from './conductor.js';
import { Keeper } from './keeper.js';
import { Mo } from './mo.js';
import { ControlError, Pete } from './pete.js';
import { BotState } from './state.js';
import { HeadWatchdog } from './watchdog.js';

export async function startRuntime(env: BotEnv) {
  if (!env.MARKET_ADDRESS || !env.FAUCET_ADDRESS || !env.BOTS_TOKEN || !env.RPC_WS || keyNames.some((k) => !env[k])) {
    throw new Error('Configure contracts, RPC_WS, BOTS_TOKEN and all six distinct bot keys.');
  }
  if (env.CHAIN === 'mainnet' && env.MAINNET_SENDS_ENABLED !== 'true') throw new Error('Mainnet activation has not been approved.');
  const clients = createChainClients(env);
  if (new Set([...clients.wallets.values()].map((w) => w.account.address)).size !== 6) throw new Error('Every bot must have a distinct key.');
  if (await clients.publicClient.getChainId() !== clients.chain.id || await clients.headClient!.getChainId() !== clients.chain.id) throw new Error('RPC chain mismatch.');
  for (const wallet of clients.wallets.values()) {
    const [latest, pendingNonce] = await Promise.all([
      clients.publicClient.getTransactionCount({ address: wallet.account.address, blockTag: 'latest' }),
      clients.publicClient.getTransactionCount({ address: wallet.account.address, blockTag: 'pending' })
    ]);
    if (latest !== pendingNonce) throw new Error('Wait for previous-instance bot transactions before startup.');
  }
  const market = env.MARKET_ADDRESS as Address;
  const faucet = env.FAUCET_ADDRESS as Address;
  const [code, faucetMarket, blocks] = await Promise.all([
    clients.publicClient.getCode({ address: market }),
    clients.publicClient.readContract({ address: faucet, abi: faucetAbi, functionName: 'MARKET' }),
    clients.publicClient.readContract({ address: market, abi: batchAuctionAbi, functionName: 'BATCH_BLOCKS' })
  ]);
  if (!code || code === '0x' || faucetMarket.toLowerCase() !== market.toLowerCase() || blocks !== 1) throw new Error('Contract configuration mismatch.');
  for (const [functionName, expected] of [['MIN_PRICE', 500_000n], ['TICK_SIZE', 5_000n], ['LOT', 10n ** 15n]] as const) {
    if (await clients.publicClient.readContract({ address: market, abi: batchAuctionAbi, functionName }) !== expected) throw new Error('Demo market parameters mismatch.');
  }
  const state = new BotState(); const writer = new ChainWriter(env, clients);
  const mo = new Mo(env); const pete = new Pete(env, mo);
  const current = await clients.publicClient.getBlockNumber();
  const deployed = addresses[clients.chain.id];
  const start = env.START_BLOCK ?? (deployed?.market.toLowerCase() === market.toLowerCase() ? deployed.startBlock : undefined);
  if (!start) throw new Error('Configure START_BLOCK from the deployment receipt to recover historical claims.');
  const keeper = new Keeper(clients, market, BigInt(start), state);
  // Recover history in bounded windows before permitting wake/unleash.
  while (keeper.nextScanBlock <= current) await keeper.scan(current);
  let stopped = false; let running = false; let pending: Block | undefined;
  let observedBlock: Block | undefined; let maintainedHead: bigint | undefined;
  let balanceAt = 0;
  const refreshBalances = async () => {
    await Promise.all([...clients.wallets].map(async ([name, wallet]) => {
      state.balance(name, await clients.publicClient.getBalance({ address: wallet.account.address }));
    })); balanceAt = Date.now();
  };
  await refreshBalances();
  async function head(block: Block): Promise<void> {
    if (stopped || block.number === null || block.baseFeePerGas === null) return;
    if (state.lastHead !== null && block.number <= state.lastHead) return;
    state.lastHead = block.number; state.lastHeadAt = Date.now(); observedBlock = block;
    void maintain();
    const base = block.baseFeePerGas;
    const send = async (name: KeyName, call: OrderCall, priority = parseGwei('1')) => {
      const hash = await writer.send(name, call, base, priority); state.sent++;
      state.log('sent', { key: name, action: call.action, hash, head: block.number }); return hash;
    };
    const attempt = async (component: string, task: () => Promise<unknown>) => {
      try { await task(); } catch { state.error(component, 'Operation failed; inspect funding, nonce or RPC availability.'); }
    };
    // Quote and priority orders are sent promptly. Maintenance follows; one queue per key.
    const active = pete.active(block.number);
    const quote = mo.quote(block.number, active);
    const orders = pete.orders(block.number);
    await Promise.all([
      ...(quote ? [attempt('mo', () => send('MO_PK', quote))] : []),
      ...orders.map(({ name, call }) => attempt(name, () => send(name, call, base * BigInt(env.PETE_PRIORITY_MULT))))
    ]);
    void maintain();
  }
  let maintenanceRunning = false;
  const maintain = async () => {
    if (maintenanceRunning || stopped || !observedBlock || observedBlock.number === maintainedHead) return;
    maintenanceRunning = true;
    try {
      await writer.receipts((hash, success) => {
        state.receipts++; if (!success) { state.reverts++; state.error('receipt', 'Transaction reverted.'); }
        keeper.receipt(hash, success);
      });
      const block = observedBlock;
      if (block.number === null || block.baseFeePerGas === null) return;
      // HTTP and WS can be served by different nodes. Never advance a log cursor
      // past the HTTP node's confirmed head merely because WS is already ahead.
      const httpHead = await clients.publicClient.getBlockNumber({ cacheTime: 0 });
      const confirmedHead = httpHead < block.number ? httpHead : block.number;
      await keeper.scan(confirmedHead);
      await keeper.onHead(confirmedHead, async (call) => {
        const hash = await writer.send('KEEPER_PK', call, block.baseFeePerGas!, parseGwei('1'));
        state.sent++; state.log('sent', { key: 'KEEPER_PK', action: call.action, hash }); return hash;
      });
      if (Date.now() - balanceAt > 10_000) await refreshBalances();
      maintainedHead = block.number;
    } catch { state.error('maintenance', 'Keeper, receipt or balance operation failed; retrying from the chain cursor.'); }
    finally { maintenanceRunning = false; }
  };
  const maintenanceTimer = setInterval(() => { void maintain(); }, 300);
  const pump = async (block: Block): Promise<void> => {
    if (running) { pending = block; state.skippedHeads++; return; }
    running = true;
    try {
      let next: Block | undefined = block;
      while (next && !stopped) { await head(next); next = pending; pending = undefined; }
    } catch { state.error('head', 'Head processing failed.'); }
    finally { running = false; }
  };
  let unwatch = () => {}; let unwatchLogs = () => {};
  const subscribe = () => {
    unwatchLogs = clients.headClient!.watchContractEvent({ address: market, abi: batchAuctionAbi, eventName: 'BatchCleared',
      onLogs: () => { void maintain(); }, onError: () => state.error('logs', 'Log subscription unavailable; HTTP catch-up remains active.') });
    unwatch = clients.headClient!.watchBlocks({ emitOnBegin: true, onBlock: (block) => {
      if (block.number !== null) { watchdog.observed(block.number); state.lastSocketHeadAt = Date.now(); }
      void pump(block);
    }, onError: () => state.error('websocket', 'Head subscription unavailable.') });
  };
  const watchdog = new HeadWatchdog<Block>({
    poll: () => clients.publicClient.getBlock(), deliver: block => { state.httpFallbackHeads++; return pump(block); },
    error: (component, message) => state.error(component, message),
    restart: async () => {
      state.socketRestarts++;
      unwatch(); unwatchLogs();
      const socket = await clients.headClient!.transport.getRpcClient(); socket.close();
      if (!stopped) {
        if (await clients.headClient!.getChainId() !== clients.chain.id) throw new Error('RPC chain mismatch.');
        if (!stopped) subscribe();
      }
    }
  });
  subscribe();
  const watchdogTimer = setInterval(() => { void watchdog.tick(); }, 1000);
  const app = createConductor({ token: env.BOTS_TOKEN, wake: () => mo.wake(),
    unleash: () => {
      if (state.lastHead === null || Date.now() - state.lastHeadAt > 15_000) throw new ControlError('Waiting for a recent chain head.', 503);
      if ([...state.balances.values()].some((b) => b <= 12n * 10n ** 18n)) throw new ControlError('Fund every bot above 12 MON first.', 503);
      return pete.unleash(state.lastHead);
    }, health: () => ({ ...state.snapshot(mo.awake, pete.active(state.lastHead ?? current)),
      chainId: clients.chain.id, burstBlocks: env.PETE_BURST_BLOCKS, remainingToday: pete.remainingToday }) });
  return { app, state, stop: async () => { stopped = true; clearInterval(maintenanceTimer); clearInterval(watchdogTimer);
    await watchdog.stop(); unwatch(); unwatchLogs();
    // Allow the current bounded RPC operations to finish before process shutdown.
    while (running || maintenanceRunning) await new Promise((resolve) => setTimeout(resolve, 50));
    const socket = await clients.headClient!.transport.getRpcClient(); socket.close();
    state.log('stopped'); } };
}
