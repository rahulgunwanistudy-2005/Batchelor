import { expect, it, vi } from 'vitest';
import { parseEther } from 'viem';
import { ChainWriter, keyNames, readEnv } from './chain.js';
import type { ChainClients } from './chain.js';
import { transactionGas } from '@batchelor/core/gas';
const address = '0x0000000000000000000000000000000000000001';
const hash = '0x1234';
function fixture(balance = parseEther('20')) {
  const publicClient = { getBalance: vi.fn().mockResolvedValue(balance), getTransactionCount: vi.fn().mockResolvedValue(7), sendRawTransaction: vi.fn().mockResolvedValue(hash) };
  const wallet = { account: { address }, signTransaction: vi.fn().mockResolvedValue('0x01') };
  const clients = { publicClient, wallets: new Map([[keyNames[0], wallet]]) } as unknown as ChainClients;
  const env = readEnv({ MARKET_ADDRESS: address, FAUCET_ADDRESS: address });
  return { writer: new ChainWriter(env, clients), wallet, publicClient, clients };
}
it('sends explicit buffered gas, zero value and EIP1559 caps with a local nonce', async () => {
  const { writer, wallet } = fixture();
  await writer.send('KEEPER_PK', { action: 'clear' }, 100n, 1n);
  expect(wallet.signTransaction).toHaveBeenCalledWith(expect.objectContaining({ gas: transactionGas('clear'), value: 0n, nonce: 7, maxFeePerGas: 201n, maxPriorityFeePerGas: 1n }));
});
it('refuses gas commitments that would cross the balance reserve, before signing', async () => {
  const { writer, wallet } = fixture(parseEther('12'));
  await expect(writer.send('KEEPER_PK', { action: 'clear' }, 100n, 1n)).rejects.toThrow('floor');
  expect(wallet.signTransaction).not.toHaveBeenCalled();
});
it('accounts for inflight commitments and releases a reservation only on a mined receipt', async () => {
  const cost = transactionGas('clear') * 201n;
  const { writer, wallet, publicClient, clients } = fixture(parseEther('12') + cost + 1n);
  await writer.send('KEEPER_PK', { action: 'clear' }, 100n, 1n);
  await expect(writer.send('KEEPER_PK', { action: 'clear' }, 100n, 1n)).rejects.toThrow('floor');
  expect(wallet.signTransaction).toHaveBeenCalledOnce();
  Object.assign(clients.publicClient, { getTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' }) });
  await writer.receipts(() => {});
  publicClient.getBalance.mockResolvedValue(parseEther('20'));
  const time = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_001);
  await writer.send('KEEPER_PK', { action: 'clear' }, 100n, 1n);
  expect(wallet.signTransaction).toHaveBeenCalledTimes(2);
  time.mockRestore();
});
it('never signs a mainnet transaction before approved activation', async () => {
  const { clients, wallet } = fixture();
  const writer = new ChainWriter(readEnv({ CHAIN: 'mainnet', MARKET_ADDRESS: address }), clients);
  await expect(writer.send('KEEPER_PK', { action: 'clear' }, 100n, 1n)).rejects.toThrow('approved');
  expect(wallet.signTransaction).not.toHaveBeenCalled();
});

it('reuses a conservative dedicated-key budget within the refresh window', async () => {
  const { writer, publicClient } = fixture();
  await writer.send('KEEPER_PK', { action: 'clear' }, 100n, 1n);
  await writer.send('KEEPER_PK', { action: 'clear' }, 100n, 1n);
  expect(publicClient.getBalance).toHaveBeenCalledOnce();
});
