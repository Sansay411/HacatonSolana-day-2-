const LAST_VAULT_STORAGE_KEY = "aegis-last-vault-address";

export function getLastVaultAddress() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_VAULT_STORAGE_KEY);
}

export function setLastVaultAddress(vaultAddress: string) {
  if (typeof window === "undefined" || !vaultAddress) return;
  window.localStorage.setItem(LAST_VAULT_STORAGE_KEY, vaultAddress);
}

