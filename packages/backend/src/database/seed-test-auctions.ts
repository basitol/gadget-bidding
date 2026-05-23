/**
 * Seed Test Auctions Script
 * Creates test items across all categories with auctions ending in 2, 5, and 10 minutes
 *
 * Run with: npx ts-node src/database/seed-test-auctions.ts
 */

import { prisma } from '../config/prisma';

interface AuctionData {
  title: string;
  description: string;
  brand: string;
  model: string;
  condition: string;
  specifications: Record<string, string>;
  images: string[];
  startingPrice: number;
  buyNowPrice: number;
  bidIncrement: number;
  endMinutes: number;
}

const testItems: Record<string, AuctionData[]> = {
  smartphones: [
    {
      title: 'iPhone 15 Pro Max 256GB - Natural Titanium',
      description:
        'Brand new iPhone 15 Pro Max with A17 Pro chip. Comes with original box and accessories. Never used, still sealed.',
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      condition: 'new',
      specifications: {
        Storage: '256GB',
        Color: 'Natural Titanium',
        Display: '6.7 inch Super Retina XDR',
        Chip: 'A17 Pro',
        Camera: '48MP Main',
      },
      images: [
        'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800',
      ],
      startingPrice: 850000,
      buyNowPrice: 1200000,
      bidIncrement: 5000,
      endMinutes: 20,
    },
    {
      title: 'Samsung Galaxy S24 Ultra 512GB - Titanium Black',
      description:
        'Flagship Samsung phone with S Pen. Excellent AI features and 200MP camera. Lightly used for 2 weeks.',
      brand: 'Samsung',
      model: 'Galaxy S24 Ultra',
      condition: 'like_new',
      specifications: {
        Storage: '512GB',
        RAM: '12GB',
        Display: '6.8 inch Dynamic AMOLED',
        Camera: '200MP Main',
        Battery: '5000mAh',
      },
      images: [
        'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=800',
      ],
      startingPrice: 750000,
      buyNowPrice: 1100000,
      bidIncrement: 5000,
      endMinutes: 10,
    },
  ],
  laptops: [
    {
      title: 'MacBook Pro 14" M3 Pro - Space Black',
      description:
        'Powerful MacBook Pro with M3 Pro chip. 18GB unified memory and 512GB SSD. Perfect for professionals.',
      brand: 'Apple',
      model: 'MacBook Pro 14 M3 Pro',
      condition: 'like_new',
      specifications: {
        Chip: 'M3 Pro',
        RAM: '18GB',
        Storage: '512GB SSD',
        Display: '14.2 inch Liquid Retina XDR',
        Battery: 'Up to 17 hours',
      },
      images: [
        'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800',
      ],
      startingPrice: 1200000,
      buyNowPrice: 1800000,
      bidIncrement: 10000,
      endMinutes: 8,
    },
    {
      title: 'Dell XPS 15 9530 - Intel i9, 32GB RAM',
      description:
        'Premium Windows laptop with stunning OLED display. Great for content creators and developers.',
      brand: 'Dell',
      model: 'XPS 15 9530',
      condition: 'good',
      specifications: {
        Processor: 'Intel Core i9-13900H',
        RAM: '32GB DDR5',
        Storage: '1TB NVMe SSD',
        Display: '15.6 inch 3.5K OLED',
        GPU: 'RTX 4060',
      },
      images: [
        'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800',
      ],
      startingPrice: 900000,
      buyNowPrice: 1400000,
      bidIncrement: 5000,
      endMinutes: 15,
    },
  ],
  tablets: [
    {
      title: 'iPad Pro 13" M4 - Space Black 256GB',
      description:
        'Latest iPad Pro with M4 chip and stunning tandem OLED display. Includes Apple Pencil Pro.',
      brand: 'Apple',
      model: 'iPad Pro 13 M4',
      condition: 'new',
      specifications: {
        Chip: 'M4',
        Storage: '256GB',
        Display: '13 inch Ultra Retina XDR OLED',
        Connectivity: 'WiFi + Cellular',
        Accessories: 'Apple Pencil Pro included',
      },
      images: [
        'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800',
      ],
      startingPrice: 800000,
      buyNowPrice: 1100000,
      bidIncrement: 5000,
      endMinutes: 20,
    },
    {
      title: 'Samsung Galaxy Tab S9 Ultra 512GB',
      description:
        'Massive 14.6 inch Android tablet with S Pen. Perfect for productivity and entertainment.',
      brand: 'Samsung',
      model: 'Galaxy Tab S9 Ultra',
      condition: 'like_new',
      specifications: {
        Storage: '512GB',
        RAM: '12GB',
        Display: '14.6 inch Dynamic AMOLED 2X',
        Processor: 'Snapdragon 8 Gen 2',
        'S Pen': 'Included',
      },
      images: [
        'https://images.unsplash.com/photo-1561154464-82e9adf32764?w=800',
      ],
      startingPrice: 600000,
      buyNowPrice: 900000,
      bidIncrement: 5000,
      endMinutes: 8,
    },
  ],
  smartwatches: [
    {
      title: 'Apple Watch Ultra 2 - Titanium with Orange Alpine Loop',
      description:
        'The ultimate sports watch. 49mm titanium case with precision dual-frequency GPS.',
      brand: 'Apple',
      model: 'Watch Ultra 2',
      condition: 'new',
      specifications: {
        'Case Size': '49mm',
        Material: 'Titanium',
        Display: 'Always-On Retina LTPO OLED',
        'Water Resistance': '100m',
        Battery: 'Up to 36 hours',
      },
      images: [
        'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=800',
      ],
      startingPrice: 450000,
      buyNowPrice: 650000,
      bidIncrement: 2500,
      endMinutes: 2,
    },
    {
      title: 'Samsung Galaxy Watch 6 Classic 47mm - Silver',
      description:
        'Classic design with rotating bezel. Advanced health monitoring and fitness tracking.',
      brand: 'Samsung',
      model: 'Galaxy Watch 6 Classic',
      condition: 'like_new',
      specifications: {
        'Case Size': '47mm',
        Display: '1.5 inch Super AMOLED',
        Processor: 'Exynos W930',
        Battery: '425mAh',
        OS: 'Wear OS 4',
      },
      images: [
        'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800',
      ],
      startingPrice: 180000,
      buyNowPrice: 280000,
      bidIncrement: 2000,
      endMinutes: 10,
    },
  ],
  headphones: [
    {
      title: 'Apple AirPods Max - Space Gray',
      description:
        'Premium over-ear headphones with incredible sound quality and active noise cancellation.',
      brand: 'Apple',
      model: 'AirPods Max',
      condition: 'like_new',
      specifications: {
        Driver: 'Apple-designed dynamic',
        ANC: 'Active Noise Cancellation',
        Transparency: 'Yes',
        'Spatial Audio': 'Dolby Atmos',
        Battery: '20 hours',
      },
      images: [
        'https://images.unsplash.com/photo-1613040809024-b4ef7ba99bc3?w=800',
      ],
      startingPrice: 280000,
      buyNowPrice: 420000,
      bidIncrement: 2000,
      endMinutes: 5,
    },
    {
      title: 'Sony WH-1000XM5 - Black',
      description:
        'Industry-leading noise cancellation with exceptional sound quality. 30-hour battery life.',
      brand: 'Sony',
      model: 'WH-1000XM5',
      condition: 'good',
      specifications: {
        Driver: '30mm',
        ANC: 'Industry-leading',
        Codec: 'LDAC, AAC, SBC',
        Battery: '30 hours',
        'Quick Charge': '3 min = 3 hours',
      },
      images: [
        'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=800',
      ],
      startingPrice: 150000,
      buyNowPrice: 250000,
      bidIncrement: 2000,
      endMinutes: 10,
    },
  ],
  cameras: [
    {
      title: 'Sony A7 IV Full Frame Mirrorless Camera Body',
      description:
        'Professional full-frame camera with 33MP sensor. Excellent for photo and video.',
      brand: 'Sony',
      model: 'A7 IV',
      condition: 'like_new',
      specifications: {
        Sensor: '33MP Full Frame',
        Video: '4K 60fps',
        ISO: '100-51200',
        'AF Points': '759',
        Stabilization: '5-axis IBIS',
      },
      images: [
        'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800',
      ],
      startingPrice: 950000,
      buyNowPrice: 1400000,
      bidIncrement: 10000,
      endMinutes: 2,
    },
    {
      title: 'Canon EOS R6 Mark II with RF 24-105mm Lens',
      description:
        'Versatile full-frame camera with kit lens. Great for both stills and video content.',
      brand: 'Canon',
      model: 'EOS R6 Mark II',
      condition: 'good',
      specifications: {
        Sensor: '24.2MP Full Frame',
        Video: '4K 60fps, 6K RAW',
        ISO: '100-102400',
        AF: 'Dual Pixel CMOS AF II',
        Lens: 'RF 24-105mm f/4L IS USM',
      },
      images: [
        'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800',
      ],
      startingPrice: 1100000,
      buyNowPrice: 1600000,
      bidIncrement: 10000,
      endMinutes: 5,
    },
  ],
  gaming: [
    {
      title: 'PlayStation 5 Disc Edition with Extra Controller',
      description:
        'Latest PS5 console with disc drive. Includes extra DualSense controller and 3 games.',
      brand: 'Sony',
      model: 'PlayStation 5',
      condition: 'like_new',
      specifications: {
        Storage: '825GB SSD',
        Resolution: '4K 120Hz',
        'Ray Tracing': 'Yes',
        Controller: '2x DualSense',
        Games: '3 included',
      },
      images: [
        'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=800',
      ],
      startingPrice: 380000,
      buyNowPrice: 550000,
      bidIncrement: 5000,
      endMinutes: 5,
    },
    {
      title: 'Nintendo Switch OLED Model - White',
      description:
        'Enhanced Switch with vibrant OLED screen. Perfect for portable gaming.',
      brand: 'Nintendo',
      model: 'Switch OLED',
      condition: 'good',
      specifications: {
        Display: '7 inch OLED',
        Storage: '64GB',
        Dock: 'Wired LAN port',
        Battery: '4.5-9 hours',
        'Joy-Con': 'White',
      },
      images: [
        'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=800',
      ],
      startingPrice: 200000,
      buyNowPrice: 320000,
      bidIncrement: 2000,
      endMinutes: 10,
    },
  ],
  accessories: [
    {
      title: 'Apple MagSafe Accessories Bundle',
      description:
        'Complete MagSafe bundle: Battery Pack, Charger, and Wallet. All original Apple products.',
      brand: 'Apple',
      model: 'MagSafe Bundle',
      condition: 'new',
      specifications: {
        Items: 'Battery Pack + Charger + Wallet',
        Compatibility: 'iPhone 12 and later',
        'Battery Capacity': '1460mAh',
        'Charger Output': '15W',
      },
      images: [
        'https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?w=800',
      ],
      startingPrice: 85000,
      buyNowPrice: 130000,
      bidIncrement: 1000,
      endMinutes: 2,
    },
    {
      title: 'Samsung 3-in-1 Wireless Charging Station',
      description:
        'Charge your phone, watch, and earbuds simultaneously. Fast wireless charging support.',
      brand: 'Samsung',
      model: 'Wireless Charger Trio',
      condition: 'like_new',
      specifications: {
        Devices: 'Phone + Watch + Earbuds',
        'Phone Output': '15W',
        'Watch Output': '10W',
        'Earbuds Output': '5W',
        Cable: 'USB-C included',
      },
      images: [
        'https://images.unsplash.com/photo-1586816879360-004f5b0c51e5?w=800',
      ],
      startingPrice: 45000,
      buyNowPrice: 75000,
      bidIncrement: 1000,
      endMinutes: 5,
    },
  ],
};

async function seedTestAuctions() {
  console.log('🚀 Starting test auction seeding...\n');

  // Find seller (phone ending in 9's)
  const seller = await prisma.user.findFirst({
    where: {
      phoneNumber: {
        contains: '9999',
      },
    },
  });

  if (!seller) {
    console.error(
      '❌ Seller not found. Please create a seller account with phone number containing 9999 first.'
    );
    process.exit(1);
  }

  console.log(`✅ Found seller: ${seller.fullName} (${seller.phoneNumber})\n`);

  // Get all categories
  const categories = await prisma.gadgetCategory.findMany({
    where: { isActive: true },
  });

  const categoryMap = new Map(categories.map(c => [c.slug, c.id]));
  console.log(`📂 Found ${categories.length} categories\n`);

  const now = new Date();
  const createdAuctions: {
    title: string;
    endMinutes: number;
    category: string;
  }[] = [];

  for (const [categorySlug, items] of Object.entries(testItems)) {
    const categoryId = categoryMap.get(categorySlug);

    if (!categoryId) {
      console.warn(`⚠️  Category '${categorySlug}' not found, skipping...`);
      continue;
    }

    console.log(`\n📦 Creating items for ${categorySlug}...`);

    for (const item of items) {
      const endTime = new Date(now.getTime() + item.endMinutes * 60 * 1000);

      // Create gadget
      const gadget = await prisma.gadget.create({
        data: {
          sellerId: seller.id,
          categoryId,
          title: item.title,
          description: item.description,
          brand: item.brand,
          model: item.model,
          condition: item.condition,
          specifications: item.specifications,
          images: item.images,
          status: 'approved',
        },
      });

      // Create auction
      await prisma.auction.create({
        data: {
          gadgetId: gadget.id,
          sellerId: seller.id,
          startingPrice: item.startingPrice,
          currentPrice: item.startingPrice,
          bidIncrement: item.bidIncrement,
          buyNowPrice: item.buyNowPrice,
          startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Started 1 day ago
          endTime,
          status: 'active',
          totalBids: 0,
        },
      });

      createdAuctions.push({
        title: item.title,
        endMinutes: item.endMinutes,
        category: categorySlug,
      });

      console.log(`   ✓ ${item.title} (ends in ${item.endMinutes} min)`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Successfully created 16 test auctions!\n');

  // Group by end time
  const endIn2 = createdAuctions.filter(a => a.endMinutes === 2);
  const endIn5 = createdAuctions.filter(a => a.endMinutes === 5);
  const endIn10 = createdAuctions.filter(a => a.endMinutes === 10);

  console.log('⏱️  Ending in 2 minutes:');
  endIn2.forEach(a => console.log(`   - ${a.title} (${a.category})`));

  console.log('\n⏱️  Ending in 5 minutes:');
  endIn5.forEach(a => console.log(`   - ${a.title} (${a.category})`));

  console.log('\n⏱️  Ending in 10 minutes:');
  endIn10.forEach(a => console.log(`   - ${a.title} (${a.category})`));

  console.log('\n' + '='.repeat(60));
}

// Run the seeder
seedTestAuctions()
  .catch(error => {
    console.error('❌ Error seeding auctions:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
