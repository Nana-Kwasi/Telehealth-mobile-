import { api } from './apiClient';

/**
 * Prices come from the server, never from arithmetic here.
 *
 * A discount computed on the device is one the payment endpoint has not agreed
 * to. The two drift the first time either side is edited, and the symptom is a
 * booking screen advertising a price the till refuses. This module only ASKS.
 */

export async function quotePrice({ serviceType, baseAmount, providerId, code }) {
  const amount = Number(baseAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const params = new URLSearchParams({ serviceType, baseAmount: String(amount) });
  if (providerId) params.set('providerId', providerId);
  if (code) params.set('code', code);

  try {
    return await api(`/api/v1/promotions/quote?${params.toString()}`);
  } catch {
    // A failed quote must not block a booking. Falling back to the full fee is
    // the safe direction — nobody is charged more than they were shown.
    return { baseAmount: amount, discountAmount: 0, finalAmount: amount, discounted: false };
  }
}

/** Price a whole list in one request, keyed by each item's `key`. */
export async function quotePrices(items) {
  const priced = (items || []).filter((i) => Number(i.baseAmount) > 0);
  if (!priced.length) return {};
  try {
    return await api('/api/v1/promotions/quote/batch', { method: 'POST', body: priced });
  } catch {
    return {};
  }
}

export async function activePromotions() {
  try {
    const list = await api('/api/v1/promotions/active');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function formatMoney(amount, currency = 'GHS') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `${currency} ${n.toFixed(2)}`;
}
