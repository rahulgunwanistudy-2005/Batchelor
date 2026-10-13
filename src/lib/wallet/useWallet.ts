import { useSyncExternalStore } from "react";
import { getAddress, hexToNumber, numberToHex, type Address, type EIP1193Provider } from "viem";
import { networkConfig } from "@/lib/network/status";

export type WalletStatus =
  | "checking"
  | "no-provider"
  | "disconnected"
  | "connecting"
  | "connected";

export interface WalletOption {
  id: string;
  name: string;
}

export interface WalletState {
  status: WalletStatus;
  /** Wallets announced by the browser (EIP-6963). Empty if only a legacy wallet exists. */
  wallets: WalletOption[];
  address: Address | null;
  /** Chain the wallet itself is on; independent of the app's RPC endpoint. */
  chainId: number | null;
  error: string | null;
}

const DISCONNECTED_KEY = "batchelor.wallet.disconnected";
const PROVIDER_KEY = "batchelor.wallet.provider";
const CHAIN_NAMES: Record<number, string> = { 143: "Monad", 10143: "Monad Testnet" };

const initialState: WalletState = { status: "checking", wallets: [], address: null, chainId: null, error: null };

let state = initialState;
const listeners = new Set<() => void>();

function setState(patch: Partial<WalletState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

interface AnnouncedWallet {
  info: { uuid: string; name: string };
  provider: EIP1193Provider;
}

const discovered = new Map<string, AnnouncedWallet>();
let selectedId: string | null = null;
let boundProvider: EIP1193Provider | null = null;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
}

/** The user's chosen wallet, else the only announced one, else the legacy injected one. */
function getProvider(): EIP1193Provider | null {
  const chosen = selectedId ? discovered.get(selectedId) : undefined;
  if (chosen) return chosen.provider;
  if (discovered.size === 1) return [...discovered.values()][0].provider;
  return (window as Window & { ethereum?: EIP1193Provider }).ethereum ?? null;
}

function bindProvider(provider: EIP1193Provider | null) {
  if (provider === boundProvider) return;
  boundProvider?.removeListener("accountsChanged", onAccountsChanged);
  boundProvider?.removeListener("chainChanged", onChainChanged);
  boundProvider = provider;
  provider?.on("accountsChanged", onAccountsChanged);
  provider?.on("chainChanged", onChainChanged);
}

function onAnnounce(event: Event) {
  const detail = (event as CustomEvent<AnnouncedWallet>).detail;
  if (!detail?.info?.uuid || !detail.provider || discovered.has(detail.info.uuid)) return;
  discovered.set(detail.info.uuid, detail);
  setState({ wallets: [...discovered.values()].map(({ info }) => ({ id: info.uuid, name: info.name })) });
  // A wallet that announces late can still be picked up.
  if (state.status === "no-provider") void restore();
}

// Injected wallets cannot be disconnected by a site, so a user's choice to
// disconnect is remembered locally and the session is not restored.
function readDisconnected(): boolean {
  return readStored(DISCONNECTED_KEY) === "1";
}

function writeDisconnected(value: boolean) {
  writeStored(DISCONNECTED_KEY, value ? "1" : null);
}

function describeError(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === 4001) return "The request was rejected in the wallet.";
  if (code === -32002) return "A wallet request is already open. Check your wallet.";
  return "The wallet request failed. Try again.";
}

async function readChainId(provider: EIP1193Provider): Promise<number | null> {
  try {
    return hexToNumber(await provider.request({ method: "eth_chainId" }));
  } catch {
    return null;
  }
}

function onAccountsChanged(accounts: readonly string[]) {
  if (state.status !== "connected") return;
  if (accounts.length === 0) setState({ status: "disconnected", address: null, error: null });
  else setState({ address: getAddress(accounts[0]) });
}

function onChainChanged(chainId: string) {
  setState({ chainId: hexToNumber(chainId as `0x${string}`) });
}

/** Restores an already-authorised session without opening a wallet prompt. */
async function restore() {
  const provider = getProvider();
  if (!provider) {
    setState({ status: "no-provider" });
    return;
  }

  bindProvider(provider);

  try {
    const accounts = readDisconnected() ? [] : await provider.request({ method: "eth_accounts" });
    const chainId = await readChainId(provider);
    if (accounts.length > 0) setState({ status: "connected", address: getAddress(accounts[0]), chainId });
    else setState({ status: "disconnected", chainId });
  } catch {
    setState({ status: "disconnected" });
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    selectedId = readStored(PROVIDER_KEY);
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    void restore();
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      bindProvider(null);
      discovered.clear();
      state = initialState;
    }
  };
}

/**
 * Opens the wallet's connection prompt. Call only from a user gesture.
 * Pass a wallet `id` from `WalletState.wallets` when several are installed.
 */
export async function connectWallet(id?: string) {
  if (state.status === "connecting") return;
  if (id && discovered.has(id)) {
    selectedId = id;
    writeStored(PROVIDER_KEY, id);
  }
  const provider = getProvider();
  if (!provider) return;
  bindProvider(provider);

  setState({ status: "connecting", error: null });
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const chainId = await readChainId(provider);
    if (accounts.length === 0) {
      setState({ status: "disconnected", error: "The wallet returned no account." });
      return;
    }
    writeDisconnected(false);
    setState({ status: "connected", address: getAddress(accounts[0]), chainId });
  } catch (error) {
    setState({ status: "disconnected", address: null, error: describeError(error) });
  }
}

export function disconnectWallet() {
  writeDisconnected(true);
  setState({ status: "disconnected", address: null, error: null });
}

/** Asks the wallet to switch to the configured chain, offering to add it if unknown. */
export async function switchToExpectedChain() {
  const provider = getProvider();
  const { expectedChainId, rpcUrl } = networkConfig;
  if (!provider || expectedChainId === null) return;

  const chainId = numberToHex(expectedChainId);
  setState({ error: null });
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    const chainName = CHAIN_NAMES[expectedChainId];
    if (code !== 4902 || !rpcUrl || !chainName) {
      setState({ error: describeError(error) });
      return;
    }

    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId, chainName, rpcUrls: [rpcUrl], nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 } }],
      });
    } catch (addError) {
      setState({ error: describeError(addError) });
    }
  }
}

export function isWrongChain(wallet: WalletState): boolean {
  return (
    wallet.status === "connected" &&
    networkConfig.expectedChainId !== null &&
    wallet.chainId !== networkConfig.expectedChainId
  );
}

export function useWallet(): WalletState {
  return useSyncExternalStore(subscribe, () => state, () => initialState);
}
