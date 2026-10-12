import type { PageLoad } from './$types';
import { publicIndexer } from '$lib/api/config';
export const load: PageLoad = async ({ fetch }) => {
  try {
    const indexer = publicIndexer(fetch);
    return { stats: indexer ? await indexer.batchStats(500) : null, indexerMessage: indexer ? null : 'Live batch statistics are not connected yet.' };
  } catch { return { stats: null, indexerMessage: 'Live batch statistics are temporarily unavailable.' }; }
};
