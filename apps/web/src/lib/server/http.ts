import { json, type RequestEvent } from '@sveltejs/kit';
import { ApiError } from './service';
export async function body(event: RequestEvent): Promise<unknown> {
  if (event.request.headers.get('origin') && event.request.headers.get('origin') !== event.url.origin) throw new ApiError('BAD_ORIGIN', 'Open Batchelor directly to continue.', 403);
  if (!event.request.headers.get('content-type')?.includes('application/json')) throw new ApiError('INVALID_BODY', 'Send a JSON request.');
  const reader = event.request.body?.getReader();
  if (!reader) throw new ApiError('INVALID_BODY', 'Request is empty.');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 4096) { await reader.cancel(); throw new ApiError('INVALID_BODY', 'Request is too large.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const text = new TextDecoder().decode(bytes);
  try { return JSON.parse(text); } catch { throw new ApiError('INVALID_BODY', 'Request could not be read. Try again.'); }
}
export async function respond(work: () => Promise<unknown>) {
  try { return json(await work(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { const error = e instanceof ApiError ? e : new ApiError('UNAVAILABLE', 'The service is temporarily unavailable. Try again shortly.', 503); return json({ error: { code: error.code, message: error.message } }, { status: error.status, headers: { 'Cache-Control': 'no-store' } }); }
}
