import { resolveArchiveRpc } from '@batchelor/core/rpc';
import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, http, isAddress, zeroAddress } from 'viem';
import { batchAuctionAbi } from '@batchelor/core/abi';
import { addresses } from '@batchelor/core/addresses';
import { DEMO_LOT, DEMO_MIN_PRICE, DEMO_TICK_SIZE } from '@batchelor/core/settle';

async function main() {
const chain = process.env.CHAIN;
if (chain !== 'mainnet' && chain !== 'testnet') throw new Error('CHAIN must be mainnet or testnet');
const chainId = chain === 'mainnet' ? 143 : 10143;
const known = addresses[chainId];
const market = process.env.MARKET_ADDRESS || known?.market;
const start = process.env.START_BLOCK || known?.startBlock;
if (!market || !isAddress(market) || market === zeroAddress || !start || !/^\d+$/.test(start) || BigInt(start) === 0n || BigInt(start) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Set a deployed MARKET_ADDRESS and its START_BLOCK');
const rpc = resolveArchiveRpc(chain, process.env);
// Historical deployment validation keeps the separate archive provider.
const client = createPublicClient({ transport: http(rpc) });
if (await client.getChainId() !== chainId) throw new Error('RPC chain mismatch');
if ((await client.getCode({ address: market, blockNumber: BigInt(start) }) ?? '0x') === '0x') throw new Error('No market code at deployment block');
if ((await client.getCode({ address: market, blockNumber: BigInt(start) - 1n }) ?? '0x') !== '0x') throw new Error('START_BLOCK must be the deployment block, not a later checkpoint');
const params = await Promise.all(['LOT', 'MIN_PRICE', 'TICK_SIZE', 'BATCH_BLOCKS'].map(functionName => client.readContract({ address: market, abi: batchAuctionAbi, functionName: functionName as 'LOT' | 'MIN_PRICE' | 'TICK_SIZE' | 'BATCH_BLOCKS' })));
if (params[0] !== DEMO_LOT || params[1] !== DEMO_MIN_PRICE || params[2] !== DEMO_TICK_SIZE || params[3] !== 1) throw new Error('Market parameters differ from the configured demo settlement parameters');
const template = await readFile(new URL('../config.yaml', import.meta.url), 'utf8');
const config = template.slice(0, template.indexOf('chains:')) + `chains:\n  - id: ${chainId}\n    start_block: ${start}\n    hypersync_config:\n      url: https://${chain === 'mainnet' ? 'monad' : 'monad-testnet'}.hypersync.xyz\n    contracts:\n      - name: BatchAuction\n        address: ["${market.toLowerCase()}"]\n`;
await writeFile(new URL('../config.generated.yaml', import.meta.url), config);
console.log(`Validated ${chain}, ${market}, deployment block ${start}. Run with ENVIO_CONFIG=config.generated.yaml.`);

}
void main().catch(() => { console.error('Operation failed. Check configuration, RPC access, chain ID and saved evidence. Provider error details are omitted to protect credentials.'); process.exitCode = 1; });
