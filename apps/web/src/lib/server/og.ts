/** Deterministic PNG card using a generated atlas of the existing brand fonts. */
import { deflateSync, inflateSync } from 'node:zlib';
import type { BatchReceipt } from '$lib/api/graphql';
import { formatUnits, LOT } from '@batchelor/core/format';
import atlas from './og-fonts.generated.json';
const width=1200,height=630;
function crc32(bytes:Buffer){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type:string,data:Buffer){const name=Buffer.from(type),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([head,name,data,tail]);}
export function receiptPng(receipt:BatchReceipt):Uint8Array {
  const pixels=Buffer.alloc(width*height*3);
  const rect=(x:number,y:number,w:number,h:number,color:number[])=>{for(let row=Math.max(0,y);row<Math.min(height,y+h);row++)for(let col=Math.max(0,x);col<Math.min(width,x+w);col++){const i=(row*width+col)*3;pixels[i]=color[0]!;pixels[i+1]=color[1]!;pixels[i+2]=color[2]!;}};
  const ink=[22,32,58],clear=[75,51,200],muted=[93,103,130];
  const fontCache=new Map<string,Buffer>();
  const text=(value:string,x:number,y:number,fontKey:keyof typeof atlas,color=ink)=>{
    const font=atlas[fontKey];
    const glyphs:Record<string,{width:number;height:number;pixels:string}>=font.glyphs;
    for(const char of value){
      const glyph=glyphs[char]??glyphs[' ']!;
      const key=fontKey+char;
      let mask=fontCache.get(key);if(!mask){mask=inflateSync(Buffer.from(glyph.pixels,'base64'));fontCache.set(key,mask);}
      for(let row=0;row<glyph.height;row++)for(let col=0;col<glyph.width;col++){
        if(x+col>=width||y+row>=height||x+col<0||y+row<0)continue;
        const alpha=mask[row*glyph.width+col]!/255;if(!alpha)continue;
        const i=((y+row)*width+x+col)*3;
        for(let channel=0;channel<3;channel++)pixels[i+channel]=Math.round(pixels[i+channel]!*(1-alpha)+color[channel]!*alpha);
      }
      x+=glyph.width;
    }
  };
  rect(0,0,width,height,[243,245,248]);rect(0,0,12,height,clear);
  text('Batchelor',64,36,'heading');text(`Batch #${receipt.batchId}`,64,116,'text',muted);
  const price=receipt.clearedBlock===null?'Awaiting clearing':receipt.volumeLots===0n?'No matched volume':`${formatUnits(receipt.price!,6).replace(/00$/,'')} dUSD`;
  text(price,64,200,price.length>16?'heading':'price',clear);
  text(`${receipt.placedCount} orders, ${receipt.volumeLots>0n?'one price.':'one batch.'}`,64,360,'heading');
  const volume=`${formatUnits(receipt.volumeLots*LOT,18).replace(/\.?0+$/,'')} ROSE matched`;
  text(volume,64,448,'text',muted);
  text(`Demo tokens on Monad ${receipt.chainId===143?'mainnet':'testnet'}. No real value.`,64,558,'text',muted);
  const scan=Buffer.alloc(height*(width*3+1));for(let row=0;row<height;row++)pixels.copy(scan,row*(width*3+1)+1,row*width*3,(row+1)*width*3);
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]));
}
