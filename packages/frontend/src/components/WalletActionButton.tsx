import React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ChevronDownIcon, WalletIcon } from "./Icons";
import { useI18n } from "../i18n";

interface WalletActionButtonProps {
  className?: string;
}

function shortKey(key?: string | null) {
  if (!key) return "";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export default function WalletActionButton({ className = "" }: WalletActionButtonProps) {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { t } = useI18n();

  return (
    <button
      type="button"
      className={`btn btn-primary wallet-launch-button ${className}`.trim()}
      onClick={() => setVisible(true)}
    >
      <WalletIcon className="icon-svg icon-svg-sm" />
      <span>{connected ? shortKey(publicKey?.toBase58()) : t("common.connectWallet")}</span>
      <ChevronDownIcon className="icon-svg icon-svg-xs" />
    </button>
  );
}

