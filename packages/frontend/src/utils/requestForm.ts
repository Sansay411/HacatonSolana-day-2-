export function sanitizeRequestText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function canSubmitRequestForm(params: {
  amount: string;
  description: string;
  pending: boolean;
  isFrozen: boolean;
  isClosed: boolean;
}) {
  const amountValue = Number(params.amount);
  const normalizedDescription = sanitizeRequestText(params.description);

  if (params.pending || params.isFrozen || params.isClosed) return false;
  if (!Number.isFinite(amountValue) || amountValue <= 0) return false;
  if (!normalizedDescription) return false;

  return true;
}
