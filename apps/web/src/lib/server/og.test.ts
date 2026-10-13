import {expect,it} from 'vitest';
import {inflateSync} from 'node:zlib';
import {receiptPng} from './og';
import type {BatchReceipt} from '$lib/api/graphql';
it('encodes a valid data-dependent 1200 × 630 RGB PNG',()=>{
 const input={batchId:1n,placedCount:34,clearedBlock:2n,volumeLots:1000n,price:1035000n,chainId:10143} as BatchReceipt;
 const a=Buffer.from(receiptPng(input)),b=Buffer.from(receiptPng({...input,price:1040000n}));
 expect(a.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));expect(a.readUInt32BE(16)).toBe(1200);expect(a.readUInt32BE(20)).toBe(630);expect(a.equals(b)).toBe(false);
 let offset=8;while(offset<a.length){const n=a.readUInt32BE(offset),type=a.subarray(offset+4,offset+8).toString();if(type==='IDAT')expect(inflateSync(a.subarray(offset+8,offset+8+n)).length).toBe(630*(1200*3+1));offset+=n+12;}
});
