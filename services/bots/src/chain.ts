import { createPublicClient, createWalletClient, http, webSocket } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monad, monadTestnet } from 'viem/chains';
import { z } from 'zod';

const rpcUrl = (protocols: string[]) => z.string().url().refine(
  (value) => protocols.includes(new URL(value).protocol), 'Unsupported RPC protocol'
);
const key = z.templateLiteral(['0x', z.string()]).refine((value) => /^0x[0-9a-fA-F]{64}$/.test(value), 'Expected a 32-byte private key');
const schema = z.object({
  CHAIN: z.enum(['mainnet', 'testnet']).default('testnet'),
  RPC_HTTP: rpcUrl(['https:', 'http:']).optional(),
  RPC_WS: rpcUrl(['wss:', 'ws:']).optional(),
  KEEPER_PK: key.optional(),
  MO_PK: key.optional(),
  PETE_PK_1: key.optional(),
  PETE_PK_2: key.optional(),
  PETE_PK_3: key.optional(),
  PETE_PK_4: key.optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001)
});
export type BotEnv = z.infer<typeof schema>;

export function readEnv(source: NodeJS.ProcessEnv = process.env): BotEnv {
  // Empty example variables mean unconfigured, not invalid secrets.
  return schema.parse(Object.fromEntries(Object.entries(source).filter(([, value]) => value !== '')));
}

export function createChainClients(env: BotEnv) {
  const chain = env.CHAIN === 'mainnet' ? monad : monadTestnet;
  const publicClient = createPublicClient({ chain, transport: http(env.RPC_HTTP) });
  const headClient = env.RPC_WS ? createPublicClient({ chain, transport: webSocket(env.RPC_WS) }) : null;
  const wallets = Object.fromEntries(
    (['KEEPER_PK', 'MO_PK', 'PETE_PK_1', 'PETE_PK_2', 'PETE_PK_3', 'PETE_PK_4'] as const).flatMap((name) => {
      const privateKey = env[name];
      if (!privateKey) return [];
      return [[name, createWalletClient({ account: privateKeyToAccount(privateKey), chain, transport: http(env.RPC_HTTP) })]];
    })
  );
  return { chain, publicClient, headClient, wallets };
}
