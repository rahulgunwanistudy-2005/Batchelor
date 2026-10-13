import { expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { body, respond } from './http';
const event=(request:Request)=>({request,url:new URL('http://localhost/')} as RequestEvent);
it('rejects malformed, oversized and cross-origin requests with typed errors',async()=>{
  for(const [content,headers,status] of [["{",{'Content-Type':'application/json'},400],['x'.repeat(4097),{'Content-Type':'application/json'},413],['{}',{'Content-Type':'application/json',Origin:'https://other.example'},403]] as const) {
    const response=await respond(()=>body(event(new Request('http://localhost/',{method:'POST',headers,body:content}))));expect(response.status).toBe(status);expect((await response.json()).error.code).toBeDefined();
  }
});
it('accepts JSON and sanitizes unexpected internal errors',async()=>{
  expect(await body(event(new Request('http://localhost/',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"wake"}'})))).toEqual({action:'wake'});
  const response=await respond(async()=>{throw new Error('private RPC credential');});expect(JSON.stringify(await response.json())).not.toContain('private RPC credential');
});
