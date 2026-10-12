import type { PageLoad } from './$types';
import { publicIndexer } from '$lib/api/config';
export const load: PageLoad = async ({ params, fetch, url }) => {
  const viewer = url.searchParams.get('trader')?.toLowerCase() ?? null;
  try {
    const indexer = publicIndexer(fetch);
    if (!indexer) return { receipt: null, viewer, message: 'Indexed receipts are not connected yet.' };
    if (!/^[1-9]\d*$/.test(params.id)) return { receipt: null, viewer, message: 'This batch number is invalid.' };
    const receipt = await indexer.batch(params.id);
    return { receipt, viewer, message: receipt ? null : 'This batch has not been indexed yet. Try again shortly.' };
  } catch (error) {
    return { receipt: null, viewer, message: error instanceof Error ? error.message : 'Indexed data is unavailable.' };
  }
};
