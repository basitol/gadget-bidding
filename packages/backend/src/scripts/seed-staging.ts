import 'dotenv/config';
import prisma, { disconnectDatabase } from '../config/prisma';
import { hashPassword } from '../utils/password';

type SeedUserConfig = {
  phoneNumber: string;
  email: string;
  fullName: string;
  password: string;
  role: 'admin' | 'seller' | 'bidder';
  walletBalance: number;
};

const normalizePhone = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) return trimmed;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }
  if (digits.startsWith('234')) {
    return `+${digits}`;
  }
  return `+${digits}`;
};

const numberFromEnv = (name: string, fallback: number) => {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return parsed;
};

const boolFromEnv = (name: string, fallback: boolean) => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase());
};

const requireSeedConfirmation = () => {
  if (process.env.STAGING_SEED_CONFIRM !== 'seed-gadgetbid-staging') {
    throw new Error(
      'Refusing to seed. Set STAGING_SEED_CONFIRM=seed-gadgetbid-staging to confirm this is an intended test/staging seed.'
    );
  }
};

const users: SeedUserConfig[] = [
  {
    phoneNumber: normalizePhone(
      process.env.STAGING_SEED_ADMIN_PHONE || '+2348010000001'
    ),
    email: process.env.STAGING_SEED_ADMIN_EMAIL || 'admin@gadgetbid.test',
    fullName: process.env.STAGING_SEED_ADMIN_NAME || 'GadgetBid Admin',
    password: process.env.STAGING_SEED_ADMIN_PASSWORD || 'AdminTest123!',
    role: 'admin',
    walletBalance: numberFromEnv('STAGING_SEED_ADMIN_WALLET', 0),
  },
  {
    phoneNumber: normalizePhone(
      process.env.STAGING_SEED_SELLER_PHONE || '+2348020000002'
    ),
    email: process.env.STAGING_SEED_SELLER_EMAIL || 'seller@gadgetbid.test',
    fullName: process.env.STAGING_SEED_SELLER_NAME || 'GadgetBid Test Seller',
    password: process.env.STAGING_SEED_SELLER_PASSWORD || 'SellerTest123!',
    role: 'seller',
    walletBalance: numberFromEnv('STAGING_SEED_SELLER_WALLET', 0),
  },
  {
    phoneNumber: normalizePhone(
      process.env.STAGING_SEED_BUYER_PHONE || '+2348030000003'
    ),
    email: process.env.STAGING_SEED_BUYER_EMAIL || 'buyer@gadgetbid.test',
    fullName: process.env.STAGING_SEED_BUYER_NAME || 'GadgetBid Test Buyer',
    password: process.env.STAGING_SEED_BUYER_PASSWORD || 'BuyerTest123!',
    role: 'bidder',
    walletBalance: numberFromEnv('STAGING_SEED_BUYER_WALLET', 10000),
  },
];

const categories = [
  {
    name: 'Smartphones',
    slug: 'smartphones',
    description: 'iPhone, Android phones, and mobile devices',
  },
  {
    name: 'Laptops',
    slug: 'laptops',
    description: 'MacBooks, Windows laptops, and workstations',
  },
  {
    name: 'Tablets',
    slug: 'tablets',
    description: 'iPads, Android tablets, and hybrid devices',
  },
  {
    name: 'Smartwatches',
    slug: 'smartwatches',
    description: 'Apple Watch, Wear OS, and fitness watches',
  },
  {
    name: 'Headphones',
    slug: 'headphones',
    description: 'Earbuds, headphones, and audio accessories',
  },
  {
    name: 'Gaming',
    slug: 'gaming',
    description: 'Consoles, handhelds, and gaming accessories',
  },
  {
    name: 'Accessories',
    slug: 'accessories',
    description: 'Chargers, cases, cables, and gadget accessories',
  },
];

const upsertSeedUser = async (config: SeedUserConfig) => {
  const passwordHash = await hashPassword(config.password);
  const user = await prisma.user.upsert({
    where: { phoneNumber: config.phoneNumber },
    create: {
      phoneNumber: config.phoneNumber,
      email: config.email,
      fullName: config.fullName,
      passwordHash,
      role: config.role,
      isVerified: true,
      isActive: true,
      wallet: {
        create: {
          balance: config.walletBalance,
          currency: 'NGN',
          isLocked: false,
        },
      },
    },
    update: {
      email: config.email,
      fullName: config.fullName,
      passwordHash,
      role: config.role,
      isVerified: true,
      isActive: true,
      updatedAt: new Date(),
    },
    include: { wallet: true },
  });

  await prisma.wallet.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      balance: config.walletBalance,
      currency: 'NGN',
      isLocked: false,
    },
    update: {
      balance: config.walletBalance,
      currency: 'NGN',
      isLocked: false,
      updatedAt: new Date(),
    },
  });

  return user;
};

const seedCategories = async () => {
  for (const category of categories) {
    await prisma.gadgetCategory.upsert({
      where: { slug: category.slug },
      create: { ...category, isActive: true },
      update: { ...category, isActive: true },
    });
  }
};

const seedBuyerAddress = async (buyerId: string) => {
  const existing = await prisma.userAddress.findFirst({
    where: { userId: buyerId, isDefault: true },
  });

  const data = {
    label: 'Home',
    fullName: 'GadgetBid Test Buyer',
    phoneNumber: '+2348030000003',
    addressLine1: '1 Test Street',
    addressLine2: 'Near GadgetBid staging office',
    city: 'Ikeja',
    state: 'Lagos',
    postalCode: '100001',
    country: 'Nigeria',
    isDefault: true,
  };

  if (existing) {
    await prisma.userAddress.update({ where: { id: existing.id }, data });
    return;
  }

  await prisma.userAddress.create({ data: { ...data, userId: buyerId } });
};

const seedDemoAuction = async (sellerId: string) => {
  const category = await prisma.gadgetCategory.findUnique({
    where: { slug: 'smartphones' },
  });
  if (!category) throw new Error('Smartphones category was not seeded');

  const existingGadget = await prisma.gadget.findFirst({
    where: { sellerId, title: 'Staging Test iPhone 12 64GB' },
    include: { auction: true },
  });

  const now = new Date();
  const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const gadget =
    existingGadget ||
    (await prisma.gadget.create({
      data: {
        sellerId,
        categoryId: category.id,
        title: 'Staging Test iPhone 12 64GB',
        description:
          'Staging-only test listing for buyer, seller, admin, payment, and notification smoke tests.',
        brand: 'Apple',
        model: 'iPhone 12',
        condition: 'excellent',
        specifications: {
          storage: '64GB',
          color: 'Blue',
          testOnly: true,
        },
        images: [
          'https://images.unsplash.com/photo-1603891128711-11b4b03bb138?w=1200',
        ],
        status: 'approved',
      },
    }));

  if (existingGadget?.auction) {
    await prisma.auction.update({
      where: { id: existingGadget.auction.id },
      data: {
        startingPrice: 1000,
        currentPrice: 1000,
        bidIncrement: 500,
        buyNowPrice: 5000,
        startTime: new Date(now.getTime() - 5 * 60 * 1000),
        endTime,
        status: 'active',
        totalBids: 0,
        winnerId: null,
      },
    });
    return existingGadget.auction.id;
  }

  const auction = await prisma.auction.create({
    data: {
      gadgetId: gadget.id,
      sellerId,
      startingPrice: 1000,
      currentPrice: 1000,
      bidIncrement: 500,
      buyNowPrice: 5000,
      startTime: new Date(now.getTime() - 5 * 60 * 1000),
      endTime,
      status: 'active',
      totalBids: 0,
    },
  });

  return auction.id;
};

const main = async () => {
  requireSeedConfirmation();

  console.log('Seeding GadgetBid staging baseline...');

  await seedCategories();

  const seededUsers = [];
  for (const config of users) {
    const user = await upsertSeedUser(config);
    seededUsers.push({ ...config, id: user.id });
  }

  const buyer = seededUsers.find(user => user.role === 'bidder');
  const seller = seededUsers.find(user => user.role === 'seller');
  if (!buyer || !seller) throw new Error('Buyer or seller seed user missing');

  await seedBuyerAddress(buyer.id);

  let auctionId: string | undefined;
  if (boolFromEnv('STAGING_SEED_CREATE_AUCTION', true)) {
    auctionId = await seedDemoAuction(seller.id);
  }

  console.log('\nSeed complete. Test credentials:');
  for (const user of seededUsers) {
    console.log(
      `- ${user.role}: ${user.phoneNumber} / ${user.password} (${user.fullName})`
    );
  }
  if (auctionId) {
    console.log(`- demo auction: ${auctionId}`);
  }
  console.log('\nUse these only for staging/internal testing.');
};

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
