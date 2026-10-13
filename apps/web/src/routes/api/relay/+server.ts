import { body, respond } from '$lib/server/http';
import { dependencies, quota } from '$lib/server/runtime';
import { ApiError, relay, relaySchema } from '$lib/server/service';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = event => respond(async () => {
  quota(event.getClientAddress());
  const parsed = relaySchema.safeParse(await body(event));
  if (!parsed.success) throw new ApiError('INVALID_BODY', 'Check the order details and try again.');
  quota(event.getClientAddress(), parsed.data.intent.trader, 'intent');
  // relay parses decimal-string wire quantities itself.
  return relay({ intent: Object.fromEntries(Object.entries(parsed.data.intent).map(([k,v]) => [k, typeof v === 'bigint' ? v.toString() : v])), sig: parsed.data.sig }, dependencies());
});
