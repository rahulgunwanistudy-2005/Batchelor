import type { PageLoad } from './$types';
import { publicIndexer } from '$lib/api/config';
export const load: PageLoad = async ({ fetch }) => {
  try {
    const indexer = publicIndexer(fetch);
    return { batches: indexer ? await indexer.recentBatches(60) : [], indexerMessage: indexer ? null : 'Batch history is not connected yet.' };
  } catch { return { batches: [], indexerMessage: 'Batch history is temporarily unavailable. Try again shortly.' }; }
};
