import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Landing from "./pages/Landing";
import ConsoleDashboard from "./pages/ConsoleDashboard";
import CreateVault from "./pages/CreateVault";
import VaultDetail from "./pages/VaultDetail";
import ProtectedRoute from "./auth/ProtectedRoute";

import "@solana/wallet-adapter-react-ui/styles.css";

export default function App() {
  const endpoint = useMemo(() => clusterApiUrl("devnet"), []);
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/console"
                element={
                  <ProtectedRoute>
                    <ConsoleDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/create"
                element={
                  <ProtectedRoute>
                    <CreateVault />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vault/:vaultAddress"
                element={
                  <ProtectedRoute>
                    <VaultDetail />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </BrowserRouter>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
