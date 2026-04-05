import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";

export const SOLANA_NETWORK = WalletAdapterNetwork.Devnet;
export const SOLANA_NETWORK_LABEL = "Solana Devnet";

export function shortWalletAddress(address?: string | null, fallback = "") {
  if (!address) return fallback;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
