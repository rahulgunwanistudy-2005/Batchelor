import { writable } from 'svelte/store';
import { batchAuctionAbi, uncross, type AuctionResult } from '@batchelor/core';
import { parseAbiItem, type Address } from 'viem';
import { chainConfig, publicClient, socketClient } from './client';
export interface BatchMeta { id: bigint; startBlock: bigint; bidMin: number; bidMax: number; askMin: number; askMax: number; orderCount: number; hasOpen: boolean }
export interface Clear { batchId: bigint; clearTick: number; price: bigint; volumeLots: bigint; clearGas: number }
export interface LiveState {
  status: 'unconfigured' | 'connecting' | 'live' | 'reconnecting'; head: bigint | null; headAt: number; intervalMs: number;
  batch: BatchMeta | null; bids: readonly bigint[]; asks: readonly bigint[]; indicative: AuctionResult | null;
  minPrice: bigint; tickSize: bigint; lot: bigint; batchBlocks: bigint; base: Address | null; quote: Address | null;
  lastClear: Clear | null; clears: Clear[];
}
const initial: LiveState = { status: 'unconfigured', head: null, headAt: 0, intervalMs: 300, batch: null, bids: [], asks: [], indicative: null, minPrice: 0n, tickSize: 0n, lot: 0n, batchBlocks: 1n, base: null, quote: null, lastClear: null, clears: [] };
export const live = writable<LiveState>(initial);
let references = 0, stop: (() => void) | undefined;
/** Shared WS subscription; every snapshot is pinned to one head, including reference price. */
export function startLive() {
  references++;
  if (!stop) stop = connect();
  return () => { if (--references === 0) { stop?.(); stop = undefined; } };
}
function connect() {
  const config = chainConfig(); if (!config) { live.set(initial); return () => {}; }
  const client = publicClient(), ws = socketClient();
  let verified = false;
  let state = { ...initial, status: 'connecting' as LiveState['status'] }, ended = false, busy = false, latest: bigint | null = null, lastSocketAt = 0;
  let lastArrival = 0, intervals: number[] = [], polling: ReturnType<typeof setInterval> | undefined;
  const contract = { address: config.market, abi: batchAuctionAbi };
  const publish = () => { if (!ended) live.set({ ...state }); };
  publish();
  async function refresh(head: bigint) {
    latest = latest === null || head > latest ? head : latest;
    if (busy) return;
    busy = true;
    try {
      while (!ended && latest !== null) {
        const blockNumber = latest; latest = null;
        if (!verified) { if (await client.getChainId() !== config!.chain.id) throw new Error('Wrong chain'); verified = true; }
        const results = await client.multicall({ allowFailure: false, blockNumber, contracts: [
          { ...contract, functionName: 'openBatch' }, { ...contract, functionName: 'ladder', args: [0, 255] }, { ...contract, functionName: 'refTick' },
          { ...contract, functionName: 'MIN_PRICE' }, { ...contract, functionName: 'TICK_SIZE' }, { ...contract, functionName: 'LOT' },
          { ...contract, functionName: 'BATCH_BLOCKS' }, { ...contract, functionName: 'BASE' }, { ...contract, functionName: 'QUOTE' }
        ] });
        const [batch, [bids, asks], refTick, minPrice, tickSize, lot, batchBlocks, base, quote] = results;
        const logs = await client.getLogs({ address: config!.market, event: parseAbiItem('event BatchCleared(uint64 indexed batchId,uint16 clearTick,uint256 price,uint64 volumeLots,uint16 buyCutoff,uint16 sellCutoff,uint64 rB,uint64 mB,uint64 rS,uint64 mS,uint32 orderCount,uint32 clearGas)'), fromBlock: blockNumber, toBlock: blockNumber });
        const clears = logs.flatMap(log => log.args.batchId === undefined ? [] : [{ batchId: log.args.batchId, clearTick: log.args.clearTick!, price: log.args.price!, volumeLots: log.args.volumeLots!, clearGas: log.args.clearGas! }]);
        const previousId = batch.hasOpen ? batch.id - 1n : batch.id;
        if (previousId > 0n && !state.clears.some(c => c.batchId === previousId) && !clears.some(c => c.batchId === previousId)) {
          const result = await client.readContract({ ...contract, functionName: 'result', args: [previousId], blockNumber });
          if (result.clearedAt > 0n) clears.push({ batchId: previousId, clearTick: result.clearTick, price: result.volumeLots ? minPrice + BigInt(result.clearTick) * tickSize : 0n, volumeLots: result.volumeLots, clearGas: result.clearGas });
        }
        const now = Date.now();
        if (state.head !== null && blockNumber > state.head && lastArrival && blockNumber - state.head === 1n) {
          intervals = [...intervals, now - lastArrival].filter(x => x > 0 && x < 3000).slice(-21);
        }
        const sorted = [...intervals].sort((a,b) => a-b);
        const recent = [...state.clears];
        for (const clear of clears) if (!recent.some(c => c.batchId === clear.batchId)) recent.push(clear);
        recent.sort((a,b) => a.batchId > b.batchId ? -1 : a.batchId < b.batchId ? 1 : 0);
        state = { ...state, head: blockNumber, headAt: state.head === blockNumber ? state.headAt : now,
          intervalMs: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : state.intervalMs,
          batch, bids, asks, indicative: uncross(bids, asks, 0, refTick), minPrice, tickSize, lot, batchBlocks: BigInt(batchBlocks), base, quote,
          lastClear: recent[0] ?? state.lastClear, clears: recent.slice(0, 60) };
        lastArrival = now; publish();
      }
    } catch { state.status = 'reconnecting'; publish(); fallback(); }
    finally { busy = false; }
  }
  async function poll() {
    try {
      if (await client.getChainId() !== config!.chain.id) throw new Error('Wrong chain');
      await refresh(await client.getBlockNumber({ cacheTime: 0 }));
    } catch { state.status = 'reconnecting'; publish(); }
  }
  function fallback() { if (!polling && !ended) { polling = setInterval(() => void poll(), 1000); void poll(); } }
  const unsubscribe = ws?.watchBlockNumber({ emitOnBegin: true, onBlockNumber: head => {
    lastSocketAt = Date.now(); if (polling) { clearInterval(polling); polling = undefined; }
    state.status = 'live'; void refresh(head);
  }, onError: () => { state.status = 'reconnecting'; publish(); fallback(); } });
  const watchdog = setInterval(() => { if (!lastSocketAt || Date.now() - lastSocketAt > 4000) { state.status = 'reconnecting'; publish(); fallback(); } }, 1000);
  if (!ws) fallback();
  return () => { ended = true; unsubscribe?.(); clearInterval(watchdog); if (polling) clearInterval(polling); if (ws) void ws.transport.getRpcClient().then(rpc => rpc.close()).catch(() => undefined); };
}
