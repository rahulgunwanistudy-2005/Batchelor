import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/public';
import { publicIndexer } from '$lib/api/config';
import { addresses } from '@batchelor/core/addresses';
import evidence from '../../../../../docs/verification/testnet-deployment.json';
import { deploymentVerification } from '$lib/server/deployment-verification';
export const load:PageServerLoad=async({fetch})=>{
 const chainId=env.PUBLIC_CHAIN==='mainnet'?143:env.PUBLIC_CHAIN==='testnet'?10143:null;
 const deployment=chainId?addresses[chainId]:null;
 let stats=null,indexerMessage:string|null=null;
 try{const indexer=publicIndexer(fetch);stats=indexer?await indexer.batchStats():null;indexerMessage=indexer?null:'Live batch statistics are not connected yet.';}catch{indexerMessage='Live batch statistics are temporarily unavailable.';}
 const publicMarket=env.PUBLIC_MARKET_ADDRESS??'';
 const configuredMarket=/^0x[0-9a-fA-F]{40}$/.test(publicMarket)?publicMarket:null;
 return {stats,indexerMessage,chainId,deployment,configuredMarket,sourceVerification:deploymentVerification(chainId,deployment,configuredMarket,evidence)};
};
