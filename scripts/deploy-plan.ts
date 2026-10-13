import { createHash } from 'node:crypto';
import { formatEther, getContractAddress, isAddress, parseEther } from 'viem';
import type { Address, Hex } from 'viem';

export class DeploymentPlanError extends Error {}
export interface DryDeployment {
  transactions: { contractName: string; arguments: string[]; transactionType: string;
    contractAddress: Address; transaction: { gas: string; input: Hex; nonce: string; from: Address; value: string; to: null; chainId: string } }[];
}
export interface DeploymentPlan {
  version: 2; chainId: number; account: Address; sourceHash: string; liveBaseFee: string;
  maxFeePerGas: string; maxPriorityFeePerGas: string; totalGas: string; costMON: string; balanceMON: string;
  broadcast: false;
  calls: { constructor: string; args: string[]; address: Address; nonce: string; gasLimit: string; costMON: string; data: Hex }[];
}
export function planHash(plan: DeploymentPlan): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}
export function deploymentPlan(dry: DryDeployment, chainId: number, account: Address, sourceHash: string,
  baseFee: bigint, maxFee: bigint, priorityFee: bigint, balance: bigint): DeploymentPlan {
  if (maxFee < baseFee + priorityFee || maxFee <= 0n || priorityFee < 0n) throw new DeploymentPlanError('Invalid deployment fee cap.');
  if (dry.transactions.length !== 4) throw new DeploymentPlanError('Expected exactly four CREATEs.');
  const firstNonce = BigInt(dry.transactions[0]!.transaction.nonce);
  const names = ['DemoToken', 'DemoToken', 'BatchAuction', 'Faucet'];
  const calls = dry.transactions.map((tx, i) => {
    const t = tx.transaction, gas = BigInt(t.gas), nonce = BigInt(t.nonce);
    const address = getContractAddress({ from: account, nonce });
    if (tx.contractName !== names[i] || tx.transactionType !== 'CREATE' || t.to !== null || BigInt(t.value) !== 0n ||
      t.from.toLowerCase() !== account.toLowerCase() || BigInt(t.chainId) !== BigInt(chainId) || nonce < 0n || nonce > BigInt(Number.MAX_SAFE_INTEGER) || nonce !== firstNonce + BigInt(i) ||
      !isAddress(tx.contractAddress) || tx.contractAddress.toLowerCase() !== address.toLowerCase() ||
      !/^0x(?:[0-9a-fA-F]{2})+$/.test(t.input) || gas <= 0n || gas > 30_000_000n || gas * maxFee > parseEther('10')) {
      throw new DeploymentPlanError('Deployment CREATE, nonce, calldata or gas commitment is invalid.');
    }
    return { constructor: tx.contractName, args: tx.arguments, address, nonce: nonce.toString(), gasLimit: gas.toString(),
      costMON: formatEther(gas * maxFee), data: t.input };
  });
  const totalGas = calls.reduce((sum, call) => sum + BigInt(call.gasLimit), 0n);
  return { version: 2, chainId, account, sourceHash, liveBaseFee: baseFee.toString(), maxFeePerGas: maxFee.toString(),
    maxPriorityFeePerGas: priorityFee.toString(), calls, totalGas: totalGas.toString(), costMON: formatEther(totalGas * maxFee),
    balanceMON: formatEther(balance), broadcast: false };
}
/** A fresh simulation can update observations, but cannot change approved sends. */
export function assertApprovedPlan(approved: DeploymentPlan, current: DeploymentPlan, approvedHash: string | undefined,
  latestNonce: number, pendingNonce: number, baseFee: bigint, balance: bigint, attemptedTransactions = 0): void {
  if (approved.version !== 2 || approvedHash !== planHash(approved)) throw new DeploymentPlanError('Set DEPLOY_PLAN_HASH to the exact reviewed plan hash.');
  const sends = (plan: DeploymentPlan) => JSON.stringify([plan.chainId, plan.account.toLowerCase(), plan.sourceHash,
    plan.maxFeePerGas, plan.maxPriorityFeePerGas, plan.calls, plan.totalGas, plan.costMON]);
  if (sends(approved) !== sends(current)) throw new DeploymentPlanError('Deployment account, source, calls or gas limits changed; review a new plan.');
  if (attemptedTransactions > 0) throw new DeploymentPlanError('Deployment has an execution checkpoint. Inspect it manually; automatic restart/resume is disabled.');
  if (latestNonce !== pendingNonce || BigInt(pendingNonce) !== BigInt(approved.calls[0]!.nonce)) throw new DeploymentPlanError('Deployer nonce changed or a transaction is pending.');
  if (baseFee + BigInt(approved.maxPriorityFeePerGas) > BigInt(approved.maxFeePerGas)) throw new DeploymentPlanError('Live base fee exceeds the reviewed fee cap; review a new plan.');
  if (balance < BigInt(approved.totalGas) * BigInt(approved.maxFeePerGas)) throw new DeploymentPlanError('Insufficient funds for the reviewed maximum deployment fees.');
}
