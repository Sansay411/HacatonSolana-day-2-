export interface WalletSessionRecord {
  address: string;
  walletName?: string;
  walletIcon?: string;
  network: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastVaultAddress?: string;
}

const WALLET_REGISTRY_STORAGE_KEY = "aegis-wallet-registry-v4";
const WALLET_SELECTED_STORAGE_KEY = "aegis-selected-wallet-v4";
const MAX_WALLET_RECORDS = 6;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function sortRecords(records: WalletSessionRecord[]) {
  return [...records].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

function readWalletRegistry(): WalletSessionRecord[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(WALLET_REGISTRY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((record): record is WalletSessionRecord => Boolean(record?.address));
  } catch {
    return [];
  }
}

function writeWalletRegistry(records: WalletSessionRecord[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(
    WALLET_REGISTRY_STORAGE_KEY,
    JSON.stringify(sortRecords(records).slice(0, MAX_WALLET_RECORDS))
  );
}

export function getWalletSessions() {
  return sortRecords(readWalletRegistry());
}

export function getSelectedWalletAddress() {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(WALLET_SELECTED_STORAGE_KEY);
}

export function setSelectedWalletAddress(address?: string | null) {
  if (!canUseStorage()) return;
  if (!address) {
    window.localStorage.removeItem(WALLET_SELECTED_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(WALLET_SELECTED_STORAGE_KEY, address);
}

export function upsertWalletSession(input: {
  address: string;
  walletName?: string;
  walletIcon?: string;
  network?: string;
  lastVaultAddress?: string;
}) {
  if (!input.address || !canUseStorage()) return [];

  const records = readWalletRegistry();
  const now = Date.now();
  const existing = records.find((record) => record.address === input.address);

  if (existing) {
    existing.walletName = input.walletName || existing.walletName;
    existing.walletIcon = input.walletIcon || existing.walletIcon;
    existing.network = input.network || existing.network;
    existing.lastVaultAddress = input.lastVaultAddress || existing.lastVaultAddress;
    existing.lastSeenAt = now;
  } else {
    records.push({
      address: input.address,
      walletName: input.walletName,
      walletIcon: input.walletIcon,
      network: input.network || "Solana Devnet",
      firstSeenAt: now,
      lastSeenAt: now,
      lastVaultAddress: input.lastVaultAddress,
    });
  }

  writeWalletRegistry(records);
  setSelectedWalletAddress(input.address);
  return getWalletSessions();
}

export function attachVaultToWallet(address: string, vaultAddress: string) {
  if (!address || !vaultAddress) return [];
  return upsertWalletSession({ address, lastVaultAddress: vaultAddress });
}

export function clearWalletSessions() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(WALLET_REGISTRY_STORAGE_KEY);
  window.localStorage.removeItem(WALLET_SELECTED_STORAGE_KEY);
}
