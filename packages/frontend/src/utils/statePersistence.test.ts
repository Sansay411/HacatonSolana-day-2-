import test from "node:test";
import assert from "node:assert/strict";
import {
  attachVaultToWallet,
  getSelectedWalletAddress,
  getWalletSessions,
  setSelectedWalletAddress,
  upsertWalletSession,
} from "./walletRegistry";
import { getLastVaultAddress, setLastVaultAddress } from "./lastVault";

function createStorage() {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

test("wallet selection persists and wallet sessions are deduplicated by address", () => {
  const localStorage = createStorage();
  Object.defineProperty(globalThis, "window", {
    value: { localStorage },
    configurable: true,
  });

  upsertWalletSession({
    address: "Wallet1111",
    walletName: "Phantom",
    network: "Solana Devnet",
  });

  upsertWalletSession({
    address: "Wallet1111",
    walletName: "Phantom",
    network: "Solana Devnet",
    lastVaultAddress: "VaultAAAA",
  });

  const sessions = getWalletSessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.lastVaultAddress, "VaultAAAA");
  assert.equal(getSelectedWalletAddress(), "Wallet1111");
});

test("selected vault persists per wallet and falls back to the last opened vault", () => {
  const localStorage = createStorage();
  Object.defineProperty(globalThis, "window", {
    value: { localStorage },
    configurable: true,
  });

  setLastVaultAddress("VaultGlobal");
  setLastVaultAddress("VaultWalletA", "WalletAAAA");
  setLastVaultAddress("VaultWalletB", "WalletBBBB");
  attachVaultToWallet("WalletBBBB", "VaultWalletB");

  assert.equal(getLastVaultAddress("WalletAAAA"), "VaultWalletA");
  assert.equal(getLastVaultAddress("WalletBBBB"), "VaultWalletB");
  assert.equal(getLastVaultAddress("UnknownWallet"), "VaultWalletB");

  setSelectedWalletAddress("WalletBBBB");
  assert.equal(getSelectedWalletAddress(), "WalletBBBB");
});
