/**
 * Seed Cheap Test Product
 * Creates a very low-priced item for testing payments
 *
 * Run with: npx ts-node src/database/seed-cheap-test.ts
 */

import { prisma } from '../config/prisma';

async function seedCheapTestProduct() {
  console.log('🚀 Creating cheap test product for payment testing...\n');

  // Find seller (phone ending in 9's or any seller)
  let seller = await prisma.user.findFirst({
    where: {
      phoneNumber: {
        contains: '9999',
      },
    },
  });

  if (!seller) {
    // Try to find any user
    seller = await prisma.user.findFirst();
  }

  if (!seller) {
    console.error('❌ No user found. Please create a user first.');
    process.exit(1);
  }

  console.log(`✅ Using seller: ${seller.fullName} (${seller.phoneNumber})\n`);

  // Get accessories category (or any category)
  let category = await prisma.gadgetCategory.findFirst({
    where: { slug: 'accessories' },
  });

  if (!category) {
    category = await prisma.gadgetCategory.findFirst({
      where: { isActive: true },
    });
  }

  if (!category) {
    console.error('❌ No category found.');
    process.exit(1);
  }

  const now = new Date();
  const endTime = new Date(now.getTime() + 30 * 60 * 1000); // Ends in 30 minutes

  // Create gadget with very low price
  const gadget = await prisma.gadget.create({
    data: {
      sellerId: seller.id,
      categoryId: category.id,
      title: 'TEST ITEM - USB Cable (Payment Test)',
      description:
        'This is a test item for payment testing. Very cheap price of ₦100.',
      brand: 'Generic',
      model: 'USB-C Cable',
      condition: 'new',
      specifications: {
        Length: '1 meter',
        Type: 'USB-C to USB-C',
        Note: 'TEST ITEM FOR PAYMENT TESTING',
      },
      images: [
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
      ],
      status: 'approved',
    },
  });

  // Create auction with ₦100 starting price (10000 kobo)
  const auction = await prisma.auction.create({
    data: {
      gadgetId: gadget.id,
      sellerId: seller.id,
      startingPrice: 100, // ₦100
      currentPrice: 100, // ₦100
      bidIncrement: 10, // ₦10
      buyNowPrice: 200, // ₦200 Buy Now
      startTime: new Date(now.getTime() - 60 * 60 * 1000), // Started 1 hour ago
      endTime,
      status: 'active',
      totalBids: 0,
    },
  });

  console.log('✅ Created test product:\n');
  console.log('   Title: TEST ITEM - USB Cable (Payment Test)');
  console.log('   Starting Price: ₦100');
  console.log('   Buy Now Price: ₦200');
  console.log('   Bid Increment: ₦10');
  console.log(`   Ends in: 30 minutes`);
  console.log(`   Auction ID: ${auction.id}`);
  console.log(`   Gadget ID: ${gadget.id}`);
  console.log('\n🎉 You can now test payments with this cheap item!');
  console.log('   Use "Buy Now" for ₦200 or place bids starting at ₦100');
}

// Run the seeder
seedCheapTestProduct()
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
