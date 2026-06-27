"use client";

import { useEffect, useState } from "react";

type RazorpayCheckoutResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayCheckoutResult) => void;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadRazorpayScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export function useRazorpayCheckout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadRazorpayScript()
      .then(() => setReady(true))
      .catch(() => setReady(false));
  }, []);

  const openCheckout = async (options: RazorpayCheckoutOptions) => {
    await loadRazorpayScript();
    if (!window.Razorpay) {
      throw new Error("Razorpay checkout is unavailable");
    }
    const checkout = new window.Razorpay(options);
    checkout.open();
  };

  return { ready, openCheckout };
}
