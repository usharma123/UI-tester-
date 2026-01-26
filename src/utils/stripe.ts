import Stripe from "stripe";

// Initialize Stripe client
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn("STRIPE_SECRET_KEY is not set - Stripe integration disabled");
}

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2024-12-18.acacia",
    })
  : null;

// Pricing tiers configuration
export type PricingTier = "starter" | "pro" | "team";

export interface TierConfig {
  name: string;
  credits: number;
  price: number; // in dollars
  priceId: string | undefined;
  description: string;
  features: string[];
}

export const PRICING_TIERS: Record<PricingTier, TierConfig> = {
  starter: {
    name: "Starter Pack",
    credits: 10,
    price: 9,
    priceId: process.env.STRIPE_PRICE_STARTER,
    description: "Perfect for trying out UI testing",
    features: [
      "10 QA test runs",
      "Full report for each run",
      "Screenshot evidence",
      "Email support",
    ],
  },
  pro: {
    name: "Pro Pack",
    credits: 50,
    price: 39,
    priceId: process.env.STRIPE_PRICE_PRO,
    description: "Best value for regular testing",
    features: [
      "50 QA test runs",
      "Full report for each run",
      "Screenshot evidence",
      "Priority support",
      "22% savings",
    ],
  },
  team: {
    name: "Team Pack",
    credits: 200,
    price: 129,
    priceId: process.env.STRIPE_PRICE_TEAM,
    description: "For teams with heavy testing needs",
    features: [
      "200 QA test runs",
      "Full report for each run",
      "Screenshot evidence",
      "Priority support",
      "28% savings",
    ],
  },
};

// Helper to get tier by price ID
export function getTierByPriceId(priceId: string): PricingTier | null {
  for (const [tier, config] of Object.entries(PRICING_TIERS)) {
    if (config.priceId === priceId) {
      return tier as PricingTier;
    }
  }
  return null;
}

// Check if Stripe is configured
export function isStripeConfigured(): boolean {
  return !!stripe;
}

// Get public pricing info (without price IDs)
export function getPublicPricingInfo() {
  return Object.entries(PRICING_TIERS).map(([tier, config]) => ({
    tier,
    name: config.name,
    credits: config.credits,
    price: config.price,
    description: config.description,
    features: config.features,
  }));
}
