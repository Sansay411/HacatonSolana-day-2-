import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import type {
  VaultWalletSummary,
  WalletChronologyResponse,
  WalletHistoryResponse,
} from "../../../shared/src/api-types";
import { mergeChronologyPage } from "../utils/chronology";

export function useVaultWallets(vaultAddress?: string) {
  const [items, setItems] = useState<VaultWalletSummary[]>([]);
  const [loading, setLoading] = useState(Boolean(vaultAddress));
  const [error, setError] = useState<string | null>(null);

  const fetchWallets = useCallback(async () => {
    if (!vaultAddress) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/vaults/${vaultAddress}/wallets`);
      if (!response.ok) {
        throw new Error("Failed to load wallet list");
      }
      const data = (await response.json()) as { items: VaultWalletSummary[] };
      setItems(data.items || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load wallet list");
    } finally {
      setLoading(false);
    }
  }, [vaultAddress]);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  return { items, loading, error, refetch: fetchWallets };
}

export function useWalletChronology(vaultAddress?: string, walletAddress?: string) {
  const [data, setData] = useState<WalletChronologyResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(vaultAddress && walletAddress));
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchChronology = useCallback(async () => {
    if (!vaultAddress || !walletAddress) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/vaults/${vaultAddress}/wallets/${walletAddress}/chronology?limit=4`);
      if (!response.ok) {
        throw new Error("Failed to load wallet chronology");
      }
      const payload = (await response.json()) as WalletChronologyResponse;
      setData(payload);
      setNextCursor(payload.nextCursor || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load wallet chronology");
    } finally {
      setLoading(false);
    }
  }, [vaultAddress, walletAddress]);

  const loadMore = useCallback(async () => {
    if (!vaultAddress || !walletAddress || !nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const response = await apiFetch(
        `/api/vaults/wallet/${walletAddress}/history?vaultAddress=${vaultAddress}&limit=4&cursor=${nextCursor}`
      );
      if (!response.ok) {
        throw new Error("Failed to load more wallet history");
      }

      const payload = (await response.json()) as WalletHistoryResponse;
      setData((current) => mergeChronologyPage(current, payload));
      setNextCursor(payload.nextCursor || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load more wallet history");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, vaultAddress, walletAddress]);

  useEffect(() => {
    fetchChronology();
  }, [fetchChronology]);

  return { data, loading, loadingMore, hasMore: Boolean(nextCursor), error, refetch: fetchChronology, loadMore };
}
