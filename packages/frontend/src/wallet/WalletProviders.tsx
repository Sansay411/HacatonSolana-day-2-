import React, { useCallback, useMemo, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  CoinbaseWalletAdapter,
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TrustWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import { useStandardWalletAdapters } from "@solana/wallet-standard-wallet-adapter-react";
import type { WalletError } from "@solana/wallet-adapter-base";
import { AlertCircleIcon } from "../components/Icons";
import { SOLANA_NETWORK } from "../lib/solanaWallets";

interface WalletProvidersProps {
  children: React.ReactNode;
}

const ALLOWED_WALLET_NAMES = new Set([
  "phantom",
  "solflare",
  "backpack",
  "trust",
  "trust wallet",
  "coinbase",
  "coinbase wallet",
  "okx",
  "okx wallet",
]);

function mapWalletError(error: WalletError) {
  const message = error?.message || "";

  if (message.includes("User rejected")) {
    return "Wallet request was canceled.";
  }

  if (message.includes("not installed") || message.includes("not ready")) {
    return "Wallet is not installed or not available in this browser.";
  }

  if (message.includes("Loadable")) {
    return "Wallet failed to load. Refresh the page and try again.";
  }

  if (message.includes("Unexpected error")) {
    return "Wallet returned an unexpected error. Reconnect it and try again.";
  }

  return "Wallet connection failed. Try another wallet or reconnect.";
}

function WalletErrorToast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) return null;

  return (
    <div className="wallet-error-toast" role="status" aria-live="polite">
      <div className="wallet-error-toast-icon">
        <AlertCircleIcon className="icon-svg icon-svg-sm" />
      </div>
      <div className="wallet-error-toast-copy">
        <strong>Wallet Notice</strong>
        <p>{message}</p>
      </div>
      <button type="button" className="wallet-error-toast-close" onClick={onDismiss}>
        Close
      </button>
    </div>
  );
}

export default function WalletProviders({ children }: WalletProvidersProps) {
  const endpoint = useMemo(() => clusterApiUrl(SOLANA_NETWORK), []);
  const adapterWallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network: SOLANA_NETWORK }),
      new TrustWalletAdapter(),
      new CoinbaseWalletAdapter(),
    ],
    []
  );
  const discoveredWallets = useStandardWalletAdapters(adapterWallets);
  const wallets = useMemo(() => {
    const seen = new Set<string>();

    return discoveredWallets.filter((wallet) => {
      const normalizedName = wallet.name.trim().toLowerCase();

      if (!ALLOWED_WALLET_NAMES.has(normalizedName)) {
        return false;
      }

      if (seen.has(normalizedName)) {
        return false;
      }

      seen.add(normalizedName);
      return true;
    });
  }, [discoveredWallets]);
  const [walletError, setWalletError] = useState<string | null>(null);

  const handleWalletError = useCallback((error: WalletError) => {
    console.warn("Wallet adapter error:", error);
    setWalletError(mapWalletError(error));
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={handleWalletError}>
        <WalletModalProvider>
          {children}
          <WalletErrorToast message={walletError} onDismiss={() => setWalletError(null)} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
