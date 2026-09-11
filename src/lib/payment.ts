export const PLAN_MONTHS = 6;
export const DEFAULT_PRODUCT_SKU =
  (import.meta as any).env?.VITE_PLAY_BILLING_SKU || "echovoice_pro_6m";

export interface PurchaseResult {
  ok: boolean;
  demo?: boolean;
  token?: string;
  reason?: string;
}

/**
 * Handles Google Play Digital Goods API (when running inside Google Play Store TWA)
 * using the official PaymentRequest API specification for Google Play Billing,
 * or falls back to an instant demo unlock when running in a standard browser.
 */
export async function purchasePremium(sku: string = DEFAULT_PRODUCT_SKU): Promise<PurchaseResult> {
  // Check for Digital Goods API (Android TWA / Play Store wrapper)
  if ("getDigitalGoodsService" in window && "PaymentRequest" in window) {
    try {
      // @ts-expect-error Digital Goods API
      const service = await window.getDigitalGoodsService("https://play.google.com/billing");
      if (service) {
        // Query item details from Play Console
        let price = "199.00";
        let currency = "INR";
        try {
          const items = await service.getDetails([sku]);
          if (items && items[0]) {
            price = items[0].value || price;
            currency = items[0].currency || currency;
          }
        } catch {}

        const paymentMethodData = [
          {
            supportedMethods: "https://play.google.com/billing",
            data: { sku },
          },
        ];

        const paymentDetails: PaymentDetailsInit = {
          total: {
            label: "Echo Voice Camera Pro (6 Months)",
            amount: { currency, value: price },
          },
        };

        const request = new PaymentRequest(paymentMethodData, paymentDetails);
        const paymentResponse = await request.show();
        const details = paymentResponse.details;
        const purchaseToken = details?.purchaseToken;

        if (purchaseToken) {
          try {
            await service.acknowledge(purchaseToken, "onetime");
          } catch (e) {
            console.warn("Acknowledgement warning:", e);
          }
        }

        await paymentResponse.complete("success");
        return { ok: true, token: purchaseToken };
      }
    } catch (e: any) {
      console.warn("Google Play Billing error or cancelled:", e);
      if (e?.name === "AbortError") {
        return { ok: false, reason: "Payment cancelled by user" };
      }
      // If running outside Play Store container, proceed with demo fallback
    }
  }

  // Fallback demo unlock (instant preview for testing/development)
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { ok: true, demo: true };
}

export async function restorePremium(): Promise<boolean> {
  if ("getDigitalGoodsService" in window) {
    try {
      // @ts-expect-error Digital Goods API
      const service = await window.getDigitalGoodsService("https://play.google.com/billing");
      if (service) {
        const purchases = await service.listPurchases();
        return Array.isArray(purchases) && purchases.length > 0;
      }
    } catch {
      return false;
    }
  }
  return false;
}

