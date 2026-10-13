import { expect,it } from 'vitest';
import { comparison,logFeeWidth,priceText,receiptModel } from './receipt';
import { batchSchema,orderSchema } from './api/graphql';
const address='0x1111111111111111111111111111111111111111',pete='0x2222222222222222222222222222222222222222',hash=`0x${'ab'.repeat(32)}`;
const batch=batchSchema.parse({id:'b',chainId:10143,batchId:'1',market:address,startBlock:'1',clearedBlock:'2',clearTxHash:hash,clearTick:100,price:'1000000',volumeLots:'10',buyCutoff:100,sellCutoff:80,rB:'10',mB:'10',rS:'10',mS:'10',orderCount:2,placedCount:2,relayedCount:0,clearGas:'100000',baseFeePerGas:'100000000000',clearedAtTimestamp:'100',maxPriorityFeePerGas:'1000000000000',medianPriorityFeePerGas:'1000000000'});
const make=(i:number,side:number,trader:string)=>orderSchema.parse({id:`o${i}`,chainId:10143,orderId:String(i),market:address,batch_id:'b',trader_id:trader,side,tick:side===0?120:80,lots:'10',relayed:false,blockNumber:'1',txIndex:i,logIndex:i,txHash:hash,effectiveGasPrice:side===0?'1100000000000':'101000000000',maxPriorityFeePerGas:side===0?'1000000000000':'1000000000',baseFeePerGas:'100000000000',priorityFeePerGas:side===0?'1000000000000':'1000000000',cancelled:false,claimed:false,claimTxHash:null,baseIn:side===1?'10000000000000000':'0',baseOut:side===0?'10000000000000000':'0',quoteIn:side===0?'10000':'0',quoteOut:side===1?'10000':'0',filledLots:'10',trader:{address:trader},batch:{batchId:'1',clearedBlock:'2'}});
it('builds data-driven headline, priority multiple and exact replay comparison',()=>{
 const orders=[make(0,1,address),make(1,0,pete)],model=receiptModel({...batch,orders},{pete:[pete],mo:address});
 expect(model.headline).toBe('2 orders, one price: 1.0000 dUSD');expect(model.description).toContain('10×');
 expect(comparison([orders[1]!],model.simulation,batch.price)).toEqual({average:900000n,difference:-100000n,percent:-1000n,filledLots:10n,batchBase:10000000000000000n});
});
it('does not claim a priority-paid order filled when it did not',()=>{
 const order={...make(0,0,pete),baseOut:0n};expect(receiptModel({...batch,orders:[order]},{pete:[pete],mo:null}).description).toContain('did not guarantee a fill');
 expect(comparison([order],{orders:[{id:order.id,filledLots:0n,priceLots:0n,averagePrice:null}]},batch.price).average).toBeNull();
});
it('formats prices and logarithmic fees safely',()=>{
 expect(priceText(1_035_000n)).toBe('1.0350 dUSD');expect(logFeeWidth(0n,10n)).toBe(0);expect(logFeeWidth(10n**25n,10n**25n)).toBe(100);expect(logFeeWidth(10n,100n)).toBeGreaterThan(10);
});
