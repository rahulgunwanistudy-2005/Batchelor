import { body, respond } from '$lib/server/http';
import { botControl, quota } from '$lib/server/runtime';
import { ApiError, wakeSchema } from '$lib/server/service';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = event => respond(async () => { quota(event.getClientAddress(), undefined, 'health'); return botControl('health'); });
export const POST: RequestHandler = event => respond(async () => {
  quota(event.getClientAddress(), undefined, 'control');
  const parsed = wakeSchema.safeParse(await body(event));
  if (!parsed.success) throw new ApiError('INVALID_BODY', 'Choose wake or unleash.');
  return botControl(parsed.data.action);
});
