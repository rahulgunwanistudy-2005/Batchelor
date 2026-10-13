import { transactionGas } from '@batchelor/core';
import { body, respond } from '$lib/server/http';
import { dependencies, quota } from '$lib/server/runtime';
import { ApiError, dripSchema } from '$lib/server/service';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = event => respond(async () => {
  quota(event.getClientAddress(), undefined, 'drip');
  const parsed = dripSchema.safeParse(await body(event));
  if (!parsed.success) throw new ApiError('INVALID_BODY', 'An account address is required.');
  quota(event.getClientAddress(), parsed.data.trader, 'faucet');
  return { hash: await dependencies().send('drip', [parsed.data.trader], transactionGas('drip')) };
});
