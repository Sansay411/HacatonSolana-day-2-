import React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ChevronDownIcon, WalletIcon } from "./Icons";
import { useI18n } from "../i18n";
import { shortWalletAddress } from "../lib/solanaWallets";

interface WalletActionButtonProps {
  className?: string;
}

export default function WalletActionButton({ className = "" }: WalletActionButtonProps) {
  const { publicKey, connected, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const { t } = useI18n();
  const walletProviderIcon = connected ? wallet?.adapter.icon : undefined;
  const walletProviderName = connected ? wallet?.adapter.name || t("wallet.providerUnknown") : t("common.connectWallet");

  return (
    <button
      type="button"
      className={`btn btn-primary wallet-launch-button ${className}`.trim()}
      onClick={() => setVisible(true)}
    >
      <span className={`wallet-launch-button-icon ${walletProviderIcon ? "has-image" : ""}`}>
        {walletProviderIcon ? (
          <img
            src={walletProviderIcon}
            alt={walletProviderName}
            className="wallet-launch-button-image"
          />
        ) : (
          <WalletIcon className="icon-svg icon-svg-sm" />
        )}
      </span>
      <span>
        {connected
          ? `${walletProviderName} ${shortWalletAddress(publicKey?.toBase58())}`
          : t("common.connectWallet")}
      </span>
      <ChevronDownIcon className="icon-svg icon-svg-xs" />
    </button>
  );
}
