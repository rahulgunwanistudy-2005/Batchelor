import type { PageServerLoad } from './$types';
import { loadReceipt, publicActors } from '$lib/server/receipt';
export const load: PageServerLoad = async ({params,fetch,url}) => {
  const candidate=url.searchParams.get('trader');
  const viewer=candidate && /^0x[0-9a-fA-F]{40}$/.test(candidate) ? candidate.toLowerCase() : null;
  return { ...await loadReceipt(params.id,fetch), viewer, actors:publicActors(), canonical:new URL(`/b/${encodeURIComponent(params.id)}`,url.origin).href, image:new URL(`/b/${encodeURIComponent(params.id)}/og.png`,url.origin).href };
};
