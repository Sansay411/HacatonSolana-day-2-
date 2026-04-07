import { attachVaultToWallet } from "./walletRegistry";

const LAST_VAULT_STORAGE_KEY = "aegis-last-vault-address-v4";
const WALLET_VAULT_MAP_STORAGE_KEY = "aegis-wallet-vault-map-v4";

function readWalletVaultMap(): Record<string, string> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(WALLET_VAULT_MAP_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeWalletVaultMap(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WALLET_VAULT_MAP_STORAGE_KEY, JSON.stringify(map));
}

export function getLastVaultAddress(walletAddress?: string | null) {
  if (typeof window === "undefined") return null;

  if (walletAddress) {
    const walletVaultMap = readWalletVaultMap();
    if (walletVaultMap[walletAddress]) {
      return walletVaultMap[walletAddress];
    }
  }

  return window.localStorage.getItem(LAST_VAULT_STORAGE_KEY);
}

export function setLastVaultAddress(vaultAddress: string, walletAddress?: string | null) {
  if (typeof window === "undefined" || !vaultAddress) return;

  window.localStorage.setItem(LAST_VAULT_STORAGE_KEY, vaultAddress);

  if (walletAddress) {
    const walletVaultMap = readWalletVaultMap();
    walletVaultMap[walletAddress] = vaultAddress;
    writeWalletVaultMap(walletVaultMap);
    attachVaultToWallet(walletAddress, vaultAddress);
  }
}

export function clearLastVaultState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LAST_VAULT_STORAGE_KEY);
  window.localStorage.removeItem(WALLET_VAULT_MAP_STORAGE_KEY);
}
