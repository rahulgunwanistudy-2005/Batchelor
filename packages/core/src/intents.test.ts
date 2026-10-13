import { expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverTypedDataAddress } from 'viem';
import { buildIntent, intentData } from './intents.js';
it('roundtrips the exact contract EIP-712 fields and domain', async () => {
  const account = privateKeyToAccount(`0x${'11'.repeat(32)}`), market = `0x${'22'.repeat(20)}` as const;
  const i = buildIntent({ trader: account.address, action: 0, side: 1, tick: 100, lots: 10n, orderId: 0n, nonce: 7n }, 100);
  expect(i.deadline).toBe(160n);
  const data = intentData(10143, market, i), signature = await account.signTypedData(data);
  expect(await recoverTypedDataAddress({ ...data, signature })).toBe(account.address);
  expect(await recoverTypedDataAddress({ ...intentData(143, market, i), signature })).not.toBe(account.address);
});
