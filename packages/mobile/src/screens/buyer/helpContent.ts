import { ImageSourcePropType } from 'react-native';

/**
 * Help centre articles. Static in the app, but every rule here matches the backend:
 * pay window ORDER_PAYMENT_EXPIRY_HOURS (24), payment reminder PAYMENT_REMINDER_HOURS_LEFT (6),
 * missed payments MISSED_PAYMENT_LIMIT / LOOKBACK / BIDDING_PAUSE_DAYS (3 / 90 / 30),
 * bid hold BID_COMMITMENT_AMOUNT (₦1,000), confirm window CONFIRM_WINDOW_HOURS (48),
 * dispute review target (48h, "usually 2 working days"), RETURN_WINDOW_DAYS (5),
 * delivery fee DELIVERY_FEE_NGN (₦3,500; pickup free), transfer accounts open 30 minutes,
 * USSD banks GTBank 737 / Zenith 966 / UBA 919. Change them together.
 */

export type HelpCategoryKey = 'bidding' | 'paying' | 'delivery' | 'problems';

export interface HelpCategory {
  key: HelpCategoryKey;
  title: string;
  icon: ImageSourcePropType;
}

export interface HelpStep {
  title: string;
  sub: string;
}

export interface HelpArticle {
  /** Stable id, also stored with "Was this helpful?" answers. */
  slug: string;
  category: HelpCategoryKey;
  title: string;
  body: string[];
  /** Vertical timeline; the last step is shown as the current one. */
  steps?: HelpStep[];
  /** Quiet note card under the body. */
  note?: string;
}

export const HELP_CATEGORIES: HelpCategory[] = [
  { key: 'bidding', title: 'Bidding', icon: require('../../../assets/icons/gavel.png') },
  { key: 'paying', title: 'Paying', icon: require('../../../assets/icons/wallet.png') },
  { key: 'delivery', title: 'Delivery', icon: require('../../../assets/icons/truck.png') },
  { key: 'problems', title: 'Problems & refunds', icon: require('../../../assets/icons/shield.png') },
];

export const HELP_ARTICLES: HelpArticle[] = [
  /* ---------- Problems & refunds ---------- */
  {
    slug: 'buyer-protection',
    category: 'problems',
    title: 'How buyer protection works',
    body: [
      "When you win, your money goes into escrow — it's held by us, not the seller. The seller is only paid once you have the item and confirm it's okay.",
    ],
    steps: [
      { title: 'You pay', sub: 'Money is held safely, not sent to the seller' },
      { title: 'We inspect it', sub: 'At our hub, against the listing' },
      { title: 'You receive it', sub: 'Check it works and matches' },
      { title: 'You confirm', sub: 'Then the seller is paid' },
    ],
    note: "If you don't confirm or report a problem within 48 hours of delivery, we confirm for you and release the payment.",
  },
  {
    slug: 'report-problem',
    category: 'problems',
    title: 'How do I report a problem with my order?',
    body: [
      "Open the order in My orders and tap Something's wrong. Tell us what happened and add up to 4 photos.",
      'Do it within 48 hours of delivery. After that, we confirm the order for you and pay the seller.',
      'Our team looks at it and usually decides within 2 working days. You can message us and the seller on the case while you wait.',
      "If we decide on a refund, send the item back to the hub within 5 days — drop it off or book a pickup. We refund you as soon as it arrives, back the way you paid. Banks usually take 3–5 working days to show it.",
    ],
    note: "Your payment stays in escrow while we look into it. The seller isn't paid until it's sorted.",
  },
  {
    slug: 'confirm-delivery',
    category: 'problems',
    title: 'What does confirming my order do?',
    body: [
      'When your gadget arrives, check it works and matches the listing. Then tap Confirm delivery on the order (or I collected it, if you picked it up).',
      "Confirming releases your payment to the seller, so only do it once you're happy.",
    ],
    note: "If you don't confirm or report a problem within 48 hours of delivery, we confirm for you and release the payment.",
  },

  /* ---------- Paying ---------- */
  {
    slug: 'missed-payment',
    category: 'paying',
    title: "What happens if I don't pay in 24 hours?",
    body: [
      "When you win, you have 24 hours to pay. We remind you when there are 6 hours left.",
      "If time runs out, the gadget is offered to the next highest bidder and it counts as a missed payment. The ₦1,000 held when you bid is kept.",
      '3 missed payments in 90 days pauses bidding for 30 days. You can still sign in, pay for orders and use the rest of the app.',
    ],
    note: 'Each missed payment shows in My orders, with what happened next.',
  },
  {
    slug: 'how-to-pay',
    category: 'paying',
    title: 'How can I pay?',
    body: [
      'Pay by card, bank transfer or USSD. Payments go through Paystack.',
      'A card you pay with is saved, so next time is one tap. Paystack holds the card; we only keep the last 4 digits.',
      'Bank transfer gives you a one-time account number that stays open for 30 minutes. USSD works with GTBank (*737#), Zenith (*966#) and UBA (*919#).',
    ],
  },
  {
    slug: 'fees',
    category: 'paying',
    title: 'Are there any fees?',
    body: [
      'Buyers pay no platform fee. Delivery within Lagos is ₦3,500, or free if you collect from the hub. You see the full total before you pay.',
      'Each auction you bid on holds ₦1,000 in your wallet until it ends.',
    ],
  },

  /* ---------- Bidding ---------- */
  {
    slug: 'auto-bid',
    category: 'bidding',
    title: 'How does auto-bid work?',
    body: [
      "Set the most you're happy to pay. We bid for you, one step at a time, only as much as it takes to keep you in the lead.",
      "If someone goes past your maximum, you're outbid and we tell you, so you can decide whether to go higher.",
      "You can change your maximum or turn auto-bid off while the auction is live. Bids it already placed stay, because bids can't be cancelled.",
    ],
  },
  {
    slug: 'cancel-bid',
    category: 'bidding',
    title: 'Can I cancel a bid?',
    body: [
      "No. A bid is a promise to buy, so it can't be cancelled or lowered. Check the listing, photos and condition before you bid.",
      'Each auction you bid on holds ₦1,000 in your wallet until it ends.',
    ],
    note: 'Using auto-bid? Turning it off stops new bids. Bids it already placed stay.',
  },
  {
    slug: 'auction-ending',
    category: 'bidding',
    title: 'What happens when an auction is about to end?',
    body: [
      'If a bid comes in during the final minutes, the clock gets a few more minutes so everyone has a fair chance.',
      "Watching it? We tell you 5 minutes before it ends. If you win, you have 24 hours to pay.",
    ],
  },

  /* ---------- Delivery ---------- */
  {
    slug: 'delivery-time',
    category: 'delivery',
    title: 'When will my item be delivered?',
    body: [
      'After you pay, the seller drops the gadget at our Computer Village hub. We check it against the listing, usually on the day it arrives.',
      "Once it passes, a rider brings it to your address in Lagos. If you chose pickup, we tell you when it's ready to collect.",
      "Follow each step in My orders. We also let you know when it passes the hub check and when it's on the way.",
    ],
  },
  {
    slug: 'hub-pickup',
    category: 'delivery',
    title: 'Can I collect from the hub instead?',
    body: [
      "Yes. Choose pickup at checkout and there's no delivery fee. We tell you when it has passed the hub check and is ready.",
      'Collect it at 2nd floor, 14 Ola-Ayeni Street, Computer Village, Ikeja. Check it there, then tap I collected it on the order.',
    ],
  },
  {
    slug: 'delivery-area',
    category: 'delivery',
    title: 'Where do you deliver?',
    body: [
      'We deliver anywhere in Lagos. Add or change your addresses in Profile › Delivery addresses, or while you check out.',
    ],
  },
];

/** The "Popular" list on Help, in the design's order. */
export const POPULAR_ARTICLES = [
  'buyer-protection',
  'missed-payment',
  'auto-bid',
  'report-problem',
  'delivery-time',
  'cancel-bid',
];

export const articleBySlug = (slug: string) => HELP_ARTICLES.find(a => a.slug === slug);
export const categoryOf = (key: HelpCategoryKey) => HELP_CATEGORIES.find(c => c.key === key)!;

/** Plain substring search over titles and text. */
export const searchArticles = (query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return HELP_ARTICLES.filter(a =>
    [a.title, ...a.body, a.note ?? '', ...(a.steps ?? []).map(s => `${s.title} ${s.sub}`)]
      .join(' ')
      .toLowerCase()
      .includes(q)
  );
};
