import './lib/validation';
import type { HandleClientError } from '@sveltejs/kit';
export const handleError: HandleClientError = () => ({
  message: 'This page could not finish loading. Refresh it, or return to Trade and try again.'
});
