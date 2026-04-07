import type { WalletChronologyResponse, WalletHistoryResponse } from "../../../shared/src/api-types";

export function mergeChronologyPage(
  current: WalletChronologyResponse | null,
  payload: WalletHistoryResponse
) {
  if (!current) return current;

  return {
    ...current,
    events: [...current.events, ...(payload.items || [])],
  };
}
