export { transactionGas } from '@batchelor/core/gas';
import { transactionGas } from '@batchelor/core/gas';
import { resolveRpcUrl } from '@batchelor/core/rpc';
import { batchAuctionAbi, faucetAbi } from '@batchelor/core/abi';
import { createPublicClient, createWalletClient, encodeFunctionData, http, keccak256, parseEther, webSocket } from 'viem';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monad, monadTestnet } from 'viem/chains';
import { z } from 'zod';
import { NonceManager } from './nonce.js';

const rpcUrl = (protocols: string[]) => z.string().url().refine(
  (value) => protocols.includes(new URL(value).protocol), 'Unsupported RPC protocol'
);
const key = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Expected a 32-byte private key');
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine((v) => !/^0x0{40}$/.test(v));
const schema = z.object({
  CHAIN: z.enum(['mainnet', 'testnet']).default('testnet'),
  RPC_HTTP: rpcUrl(['https:', 'http:']).optional(), RPC_WS: rpcUrl(['wss:', 'ws:']).optional(),
  DWELLIR_API_KEY: z.string().min(1).optional(),
  MARKET_ADDRESS: address.optional(), FAUCET_ADDRESS: address.optional(),
  KEEPER_PK: key.optional(), MO_PK: key.optional(), PETE_PK_1: key.optional(),
  PETE_PK_2: key.optional(), PETE_PK_3: key.optional(), PETE_PK_4: key.optional(),
  BOTS_TOKEN: z.string().min(24).optional(),
  MAINNET_SENDS_ENABLED: z.enum(['true', 'false']).default('false'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  PETE_PRIORITY_MULT: z.coerce.number().int().min(1).max(100).default(10),
  PETE_BURST_BLOCKS: z.coerce.number().int().min(1).max(100).default(20),
  PETE_DAILY_CAP: z.coerce.number().int().min(1).max(100).default(10),
  MO_AWAKE_SECONDS: z.coerce.number().int().min(1).max(600).default(90),
  MO_SEED: z.coerce.number().int().min(1).max(0xffffffff).default(42),
  START_BLOCK: z.string().regex(/^\d+$/).optional()
});
export type BotEnv = z.infer<typeof schema>;
export const keyNames = ['KEEPER_PK', 'MO_PK', 'PETE_PK_1', 'PETE_PK_2', 'PETE_PK_3', 'PETE_PK_4'] as const;
export type KeyName = typeof keyNames[number];

export function readEnv(source: NodeJS.ProcessEnv = process.env): BotEnv {
  // Do not include Zod's input-bearing errors in logs.
  const result = schema.safeParse(Object.fromEntries(Object.entries(source).filter(([, value]) => value !== '')));
  if (!result.success) throw new Error(`Invalid configuration: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  return result.data;
}

export function createChainClients(env: BotEnv) {
  const chain = env.CHAIN === 'mainnet' ? monad : monadTestnet;
  const rpcHttp = resolveRpcUrl(env.CHAIN, 'http', env.RPC_HTTP, env.DWELLIR_API_KEY);
  const rpcWs = env.RPC_WS || env.DWELLIR_API_KEY ? resolveRpcUrl(env.CHAIN, 'ws', env.RPC_WS, env.DWELLIR_API_KEY) : undefined;
  const publicClient = createPublicClient({ chain, transport: http(rpcHttp, { timeout: 10_000, retryCount: 1 }) });
  // The application watchdog owns restart/catch-up. viem's internal reconnect
  // path can print raw transport exceptions containing credential-bearing URLs.
  const headClient = rpcWs ? createPublicClient({ chain, transport: webSocket(rpcWs, { timeout: 10_000, reconnect: false }) }) : null;
  const wallets = new Map(keyNames.flatMap((name) => {
    const privateKey = env[name];
    return privateKey ? [[name, createWalletClient({ account: privateKeyToAccount(privateKey as Hex), chain, transport: http(rpcHttp) })] as const] : [];
  }));
  return { chain, publicClient, headClient, wallets };
}
export type ChainClients = ReturnType<typeof createChainClients>;
export type OrderCall = { action: 'place'; side: number; tick: number; lots: bigint }
  | { action: 'placeMany'; sides: number[]; ticks: number[]; lots: bigint[] }
  | { action: 'claim'; ids: bigint[] } | { action: 'clear' } | { action: 'drip'; to: Address };

export function feeCaps(baseFee: bigint, priority: bigint) {
  return { maxFeePerGas: 2n * baseFee + priority, maxPriorityFeePerGas: priority };
}
export function encodeCall(call: OrderCall): Hex {
  switch (call.action) {
    case 'place': return encodeFunctionData({ abi: batchAuctionAbi, functionName: 'place', args: [call.side, call.tick, call.lots] });
    case 'placeMany': return encodeFunctionData({ abi: batchAuctionAbi, functionName: 'placeMany', args: [call.sides, call.ticks, call.lots] });
    case 'claim': return encodeFunctionData({ abi: batchAuctionAbi, functionName: 'claim', args: [call.ids] });
    case 'clear': return encodeFunctionData({ abi: batchAuctionAbi, functionName: 'clear' });
    case 'drip': return encodeFunctionData({ abi: faucetAbi, functionName: 'drip', args: [call.to] });
  }
}

export class ChainWriter {
  private nonces = new Map<KeyName, NonceManager>();
  private queues = new Map<KeyName, Promise<unknown>>();
  private budgets = new Map<KeyName, { balance: bigint; at: number }>();
  readonly inflight = new Map<KeyName, Map<Hex, bigint>>();
  constructor(readonly env: BotEnv, readonly clients: ChainClients) {}

  async send(name: KeyName, call: OrderCall, baseFee: bigint, priority: bigint): Promise<Hex> {
    const prior = this.queues.get(name) ?? Promise.resolve();
    const task = prior.then(() => this.sendSerial(name, call, baseFee, priority));
    this.queues.set(name, task.catch(() => undefined));
    return task;
  }
  private async sendSerial(name: KeyName, call: OrderCall, baseFee: bigint, priority: bigint): Promise<Hex> {
    if (this.env.CHAIN === 'mainnet' && this.env.MAINNET_SENDS_ENABLED !== 'true') throw new Error('Mainnet sends require approved activation.');
    const wallet = this.clients.wallets.get(name);
    if (!wallet) throw new Error(`Missing wallet ${name}`);
    const target = call.action === 'drip' ? this.env.FAUCET_ADDRESS : this.env.MARKET_ADDRESS;
    if (!target) throw new Error('Missing contract address.');
    const gas = transactionGas(call.action, call.action === 'claim' ? call.ids.length : call.action === 'placeMany' ? call.sides.length : 1);
    const fees = feeCaps(baseFee, priority);
    const pending = this.inflight.get(name) ?? new Map<Hex, bigint>();
    this.inflight.set(name, pending);
    const reserved = [...pending.values()].reduce((sum, cost) => sum + cost, 0n);
    const cost = gas * fees.maxFeePerGas;
    let manager = this.nonces.get(name);
    if (!manager) {
      manager = new NonceManager(this.clients.publicClient, wallet.account.address);
      this.nonces.set(name, manager);
    }
    let budget = this.budgets.get(name);
    if (!budget || Date.now() - budget.at >= 10_000) {
      budget = { balance: await this.clients.publicClient.getBalance({ address: wallet.account.address }), at: Date.now() };
      this.budgets.set(name, budget);
    }
    // Dedicated keys only spend through this process. Confirmations deduct the maximum
    // reserved cost, so the cached budget underestimates spendable funds until refreshed.
    const balance = budget.balance;
    const newReservation = manager.hasUncertainSend ? 0n : cost;
    if (balance <= parseEther('12') + reserved + newReservation) throw new Error(`Balance floor for ${name}; funding required.`);
    let signedHash: Hex | undefined;
    try {
      const hash = await manager.submit(async (nonce) => {
        if (signedHash) pending.delete(signedHash); // A definite nonce rejection was reconciled.
        const raw = await wallet.signTransaction({ to: target as Address,
          data: encodeCall(call), gas, ...fees, nonce, value: 0n, type: 'eip1559' });
        signedHash = keccak256(raw); pending.set(signedHash, cost);
        return raw;
      }, (serializedTransaction) => this.clients.publicClient.sendRawTransaction({ serializedTransaction }),
      async (hash) => {
        try { await this.clients.publicClient.getTransaction({ hash }); return true; }
        catch { return false; }
      });
      return hash;
    } catch { throw new Error(`Send unresolved for ${name}; retained gas reservation and original payload.`); }
  }
  async receipts(onReceipt: (hash: Hex, success: boolean) => void): Promise<void> {
    for (const [name, pending] of this.inflight) {
      for (const hash of [...pending.keys()]) {
        try {
          const receipt = await this.clients.publicClient.getTransactionReceipt({ hash });
          const budget = this.budgets.get(name);
          if (budget) budget.balance -= pending.get(hash) ?? 0n;
          pending.delete(hash); onReceipt(hash, receipt.status === 'success');
        } catch (error) {
          if (!(error instanceof Error) || error.name !== 'TransactionReceiptNotFoundError') throw error;
        }
      }
    }
  }
}
