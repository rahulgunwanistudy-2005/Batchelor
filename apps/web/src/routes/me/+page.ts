import type { PageLoad } from './$types';
import { isAddress } from 'viem';
import { publicIndexer } from '$lib/api/config';
export const load: PageLoad = async ({ url, fetch }) => {
  const trader = url.searchParams.get('trader') ?? '';
  try {
    const indexer = publicIndexer(fetch);
    if (!indexer) return { orders: [], trader, message: 'Indexed order history is not connected yet.' };
    if (!isAddress(trader)) return { orders: [], trader, message: 'Enter a trader address to view its indexed orders.' };
    return { orders: await indexer.ordersByTrader(trader), trader, message: null };
  } catch (error) { return { orders: [], trader, message: error instanceof Error ? error.message : 'Indexed data is unavailable.' }; }
};
