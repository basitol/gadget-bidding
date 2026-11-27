export type GadgetKind = 'phone' | 'laptop' | 'headphones' | 'console' | 'watch';

export interface AuctionItem {
  kind: GadgetKind;
  name: string;
  grade: string;
  price: string;
  bids: number;
  seller: string;
  /** Seconds left (demo data). */
  endsIn: number;
}

export interface Category {
  name: string;
  live: number;
  description: string;
  items: AuctionItem[];
}

// Demo data for the landing page mockup — not live auctions.
export const categories: Category[] = [
  {
    name: 'Phones',
    live: 128,
    description: 'iPhone, Galaxy, Pixel and more. IMEI checked on every listing.',
    items: [
      { kind: 'phone', name: 'iPhone 15 Pro · 256 GB', grade: 'Grade A · 96%', price: '₦845,000', bids: 23, seller: 'CV-1042', endsIn: 45 },
      { kind: 'phone', name: 'Galaxy S24 Ultra', grade: 'Grade A · New', price: '₦1,150,000', bids: 14, seller: 'CV-1187', endsIn: 4920 },
      { kind: 'phone', name: 'Pixel 8 Pro', grade: 'Grade A · 128 GB', price: '₦560,000', bids: 9, seller: 'CV-0963', endsIn: 2685 },
    ],
  },
  {
    name: 'Laptops',
    live: 64,
    description: 'MacBook, ThinkPad, Dell XPS. Battery cycles and specs verified.',
    items: [
      { kind: 'laptop', name: 'MacBook Air M2', grade: 'Grade A · 8 GB / 256 GB', price: '₦910,000', bids: 17, seller: 'CV-1311', endsIn: 1210 },
      { kind: 'laptop', name: 'ThinkPad X1 Carbon', grade: 'Grade B · Gen 10', price: '₦640,000', bids: 8, seller: 'CV-1078', endsIn: 3340 },
      { kind: 'laptop', name: 'Dell XPS 13', grade: 'Grade A · i7', price: '₦705,000', bids: 11, seller: 'CV-1220', endsIn: 5610 },
    ],
  },
  {
    name: 'Audio',
    live: 41,
    description: 'Headphones, earbuds and speakers. Tested for sound and pairing.',
    items: [
      { kind: 'headphones', name: 'Sony WH-1000XM5', grade: 'Open box', price: '₦198,500', bids: 11, seller: 'CV-0914', endsIn: 960 },
      { kind: 'headphones', name: 'AirPods Max', grade: 'Grade A', price: '₦385,000', bids: 6, seller: 'CV-1265', endsIn: 2210 },
      { kind: 'headphones', name: 'Bose QC Ultra', grade: 'Grade A · New', price: '₦310,000', bids: 5, seller: 'CV-1009', endsIn: 4100 },
    ],
  },
  {
    name: 'Gaming',
    live: 37,
    description: 'Consoles and controllers. Powered on and played before delivery.',
    items: [
      { kind: 'console', name: 'PS5 Slim bundle', grade: 'Disc · 2 pads', price: '₦520,000', bids: 31, seller: 'CV-1150', endsIn: 590 },
      { kind: 'console', name: 'Xbox Series X', grade: 'Grade A · 1 TB', price: '₦495,000', bids: 12, seller: 'CV-1042', endsIn: 2950 },
      { kind: 'console', name: 'Nintendo Switch OLED', grade: 'Grade A', price: '₦310,000', bids: 9, seller: 'CV-1294', endsIn: 3880 },
    ],
  },
  {
    name: 'Wearables',
    live: 29,
    description: 'Smartwatches and fitness bands. Battery and sensors checked.',
    items: [
      { kind: 'watch', name: 'Apple Watch Series 9', grade: '45 mm · GPS', price: '₦265,000', bids: 12, seller: 'CV-0988', endsIn: 1450 },
      { kind: 'watch', name: 'Galaxy Watch 6', grade: 'Grade A · 44 mm', price: '₦165,000', bids: 7, seller: 'CV-1187', endsIn: 3170 },
      { kind: 'watch', name: 'Apple Watch Ultra 2', grade: 'Grade A', price: '₦540,000', bids: 10, seller: 'CV-1336', endsIn: 5230 },
    ],
  },
];

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
