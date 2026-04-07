import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export interface VaultCatalogItem {
  vaultAddress: string;
  name: string | null;
  projectName: string | null;
  purposeType: "startup" | "grant" | "infra" | "public_project";
  description: string | null;
  allowedCategories: string[];
  funderWallet: string | null;
  beneficiaryWallet: string | null;
  payoutWallet: string | null;
  mode: "startup" | "grant" | "freelancer";
  dailyLimitLamports: number;
  emergencyStopEnabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  analytics: {
    totalRequests: number;
    approvedRequests: number;
    rejectedRequests: number;
    pendingRequests: number;
    protectedFundsLamports: number;
    totalRequestedLamports: number;
    approvalRate: number;
  };
}

interface VaultCatalogResponse {
  items: VaultCatalogItem[];
}

export function useVaultCatalog() {
  const [items, setItems] = useState<VaultCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiFetch("/api/vaults");

      if (!response.ok) {
        throw new Error("Backend unavailable");
      }

      const data = (await response.json()) as VaultCatalogResponse;
      setItems(Array.isArray(data.items) ? data.items : []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load vault catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  return {
    items,
    loading,
    error,
    refetch: fetchCatalog,
  };
}
