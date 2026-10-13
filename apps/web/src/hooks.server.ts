import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { connectSources, secureHeaders } from '$lib/server/security';

export const handle: Handle = async ({ event, resolve }) => {
  const sources = connectSources(env, dev);
  const response = await resolve(event);
  // Redirect/error responses may have immutable headers.
  const headers = new Headers(response.headers);
  secureHeaders(headers, sources, dev);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
export const handleError: HandleServerError = ({ status }) => {
  console.error(JSON.stringify({ event: 'web_error', status }));
  return { message: 'This page is temporarily unavailable. Refresh it, or return to Trade and try again.' };
};
