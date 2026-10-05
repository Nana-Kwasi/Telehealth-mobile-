import { AppState } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { api, API_BASE } from './apiClient';

const POLL_MS = 3000;
const MAX_WAIT_MS = 15 * 60 * 1000;   // a card + OTP can genuinely take a while

/** Ask OUR server (which asks Paystack). Never trusts the browser. */
async function checkPaid(reference) {
  const res = await api(`/api/v1/payments/verify/${encodeURIComponent(reference)}`, {
    authenticated: false,
  }).catch(() => null);
  return res?.paid ? res : null;
}

/**
 * Take a payment for a booking, and resolve only once it is CONFIRMED.
 *
 * The hard part is not opening the checkout — it is noticing that the payment
 * happened.
 *
 * `openAuthSessionAsync` resolves when the browser redirects to OUR url scheme
 * or when the user taps Done. Paystack redirects to its OWN callback, so the
 * first never fires; and a user who swipes the sheet away, switches apps, or
 * just walks back leaves that promise pending forever. That is exactly what
 * went wrong in testing: the charge succeeded on Paystack, the app sat waiting,
 * and the booking was never created.
 *
 * So the browser result is treated as a hint, not the signal. Three things run
 * together, and whichever proves payment first wins:
 *
 *   1. POLLING the verify endpoint while checkout is open
 *   2. an APP-FOREGROUND check, for the user who returns via the app switcher
 *   3. the browser session resolving (Done / redirect), followed by a short
 *      re-check, since settlement can lag the redirect by a second or two
 *
 * Returns `{ ok: true, reference, amount, currency }` on a confirmed payment,
 * or `{ ok: false, reason }`. Callers must not create anything unless `ok`.
 */

/**
 * Record a price promotion against a payment that has just been confirmed.
 *
 * Deliberately here rather than in each Payment screen: every path that takes
 * money goes through payForBooking, and patching call sites one at a time is
 * how half of them end up never recording.
 *
 * Never throws. A redemption that fails to record is an accounting gap, not a
 * reason to fail a booking the customer has already paid for — the server
 * recomputes the discount anyway, so nothing here can inflate it.
 */
async function recordPromotionRedemption(reference, metadata) {
  const promotionId = metadata?.promotionId;
  if (!promotionId || !reference) return;
  try {
    await api('/api/v1/promotions/redeem', {
      method: 'POST',
      body: {
        promotionId,
        serviceType: metadata.serviceType || null,
        providerId: metadata.providerId || null,
        baseAmount: metadata.listPrice ?? metadata.baseAmount ?? null,
        reference,
      },
    });
  } catch {
    /* see above — never block a paid booking on bookkeeping */
  }
}

export async function payForBooking({ email, amount, purpose, metadata }) {
  if (!email) return { ok: false, reason: 'No email address for the payment receipt.' };
  if (!amount || Number(amount) <= 0) {
    return { ok: true, reference: null, amount: 0, skipped: true };
  }

  let init;
  try {
    init = await api('/api/v1/payments/initialize', {
      method: 'POST',
      authenticated: false,
      body: {
        email,
        amount: Number(amount),
        purpose,
        // Send checkout back to the BACKEND, not the web dev server. The
        // default callback was http://localhost:3001, which a phone cannot
        // reach — after a successful charge the in-app browser showed
        // "Safari can't open the page", which reads as a failed payment. The
        // API host is reachable by definition: we just called it.
        callbackUrl: `${API_BASE}/api/v1/payments/return`,
        metadata: metadata || {},
      },
    });
  } catch (e) {
    return { ok: false, reason: e?.message || 'Could not start the payment.' };
  }

  if (!init?.authorizationUrl || !init?.reference) {
    return { ok: false, reason: 'Payment could not be started.' };
  }

  const reference = init.reference;
  let settled = false;
  const stop = () => { settled = true; };

  // 1 — poll for confirmation while the sheet is up.
  const polling = (async () => {
    const deadline = Date.now() + MAX_WAIT_MS;
    while (!settled && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (settled) return null;
      const paid = await checkPaid(reference);
      if (paid) {
        stop();
        // Close the sheet for them — they have already paid and should not have
        // to find their own way back.
        try { WebBrowser.dismissBrowser(); } catch {}
        return paid;
      }
    }
    return null;
  })();

  // 2 — the user who comes back via the app switcher rather than Done.
  const onForeground = (state) => { if (state === 'active') checkPaid(reference).catch(() => {}); };
  const sub = AppState.addEventListener('change', onForeground);

  // 3 — the browser session itself.
  const browsing = (async () => {
    try {
      // openBrowserAsync, NOT openAuthSessionAsync.
      //
      // The auth-session API is for OAuth, and iOS gates it behind a system
      // consent dialog — "Expo Wants to Use paystack.com to Sign In. This
      // allows the app and website to share information about you." That is
      // alarming and wrong here: nobody is signing in, and we neither want nor
      // need shared cookies with Paystack.
      //
      // Its one advantage was catching a redirect to our own scheme. We no
      // longer depend on that: payment is confirmed by polling /verify, and
      // the return page closes the sheet. So use the plain browser, which
      // shows no prompt at all.
      await WebBrowser.openBrowserAsync(init.authorizationUrl, {
        dismissButtonStyle: 'cancel',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {
      // Even an error here can follow a completed charge, so fall through.
    }
    // The redirect can land marginally before Paystack marks the charge paid.
    for (let i = 0; i < 4 && !settled; i += 1) {
      const paid = await checkPaid(reference);
      if (paid) { stop(); return paid; }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  })();

  let confirmed = null;
  try {
    confirmed = await Promise.race([polling, browsing]);
    if (!confirmed) confirmed = (await Promise.all([polling, browsing])).find(Boolean) || null;
  } finally {
    stop();
    sub?.remove?.();
  }

  if (!confirmed) {
    return { ok: false, reason: 'Payment was not completed.', reference };
  }

  await recordPromotionRedemption(reference, metadata);

  return {
    ok: true,
    reference,
    amount: confirmed.amount ?? Number(amount),
    currency: confirmed.currency || init.currency || 'GHS',
  };
}

export default payForBooking;
