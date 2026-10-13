/** Optional local real-chain receipt pipeline driven by scripts/test-receipts-local.ts. */
import {expect,it} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import {createTestIndexer,type TestIndexerProcessConfig} from 'envio';
import {fill,escrowFor,DEMO_LOT,DEMO_MIN_PRICE,DEMO_TICK_SIZE} from '@batchelor/core/settle';
type Mock=NonNullable<NonNullable<TestIndexerProcessConfig['chains'][10143]>['simulate']>[number];
it.skipIf(!process.env.S7_RECEIPT_INPUT)('indexes three real local-chain batches and matches every contract preview',async()=>{
 const input=JSON.parse(await readFile(process.env.S7_RECEIPT_INPUT!,'utf8'),(_,v)=>v && typeof v==='object' && '$bigint' in v ? BigInt(v.$bigint):v) as {events:Mock[];previews:{id:bigint;batchId:bigint;values:bigint[]}[]};
 const indexer=createTestIndexer();
 await indexer.process({chains:{10143:{startBlock:Math.min(...input.events.map(e=>e.block!.number!)),endBlock:Math.max(...input.events.map(e=>e.block!.number!)),simulate:input.events}}});
 const batches=await indexer.Batch.getAll(),orders=await indexer.Order.getAll(),traders=await indexer.Trader.getAll();
 expect(batches).toHaveLength(3);expect(orders).toHaveLength(18);
 for(const order of orders){
  const batch=batches.find(b=>b.id===order.batch_id)!,preview=input.previews.find(p=>p.id===order.orderId)!;
  const exact=fill({...order,escrow:escrowFor(order.side,order.lots,DEMO_MIN_PRICE+BigInt(order.tick)*DEMO_TICK_SIZE,DEMO_LOT)},{...batch,buyCutoff:batch.buyCutoff!,sellCutoff:batch.sellCutoff!},batch.price!,DEMO_LOT);
  expect(preview.values).toEqual([order.baseOut-order.baseIn,order.quoteOut-order.quoteIn,exact.refund]);
 }
 const receipts=batches.map(batch=>({...batch,orders:orders.filter(o=>o.batch_id===batch.id).map(o=>({...o,trader:{address:traders.find(t=>t.id===o.trader_id)!.address},batch:{batchId:batch.batchId,clearedBlock:batch.clearedBlock}}))}));
 await writeFile(process.env.S7_RECEIPT_OUTPUT!,JSON.stringify(receipts,(_,v)=>typeof v==='bigint'?v.toString():v===undefined?null:v,2)+'\n');
});
