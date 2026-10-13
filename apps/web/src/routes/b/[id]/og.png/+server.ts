import type { RequestHandler } from './$types';
import { loadReceipt } from '$lib/server/receipt';
import { receiptPng } from '$lib/server/og';
export const GET:RequestHandler=async({params,fetch})=>{
  const {receipt,message}=await loadReceipt(params.id,fetch);
  if(!receipt)return new Response(message,{status:/invalid/.test(message??'')?400:503,headers:{'Cache-Control':'no-store'}});
  return new Response(receiptPng(receipt) as BodyInit,{headers:{'Content-Type':'image/png','Cache-Control':receipt.clearedBlock===null?'no-store':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
};
