import crypto from 'crypto';
import prisma, { disconnectDatabase } from '../config/prisma';
import config from '../config';
import { query } from '../config/database';
import * as orderService from '../services/order/order.service';
import * as walletService from '../services/wallet/wallet.service';
import * as paystackService from '../services/payment/paystack.service';
import {
  BID_COMMITMENT_AMOUNT,
  BID_DEFAULT_PENALTY_AMOUNT,
  BID_PAYMENT_DEADLINE_HOURS,
} from '@gadget-bidding/shared';

type UserSeed = {
  id: string;
  walletId: string;
};

type OrderFixture = {
  seller: UserSeed;
  buyer: UserSeed;
  secondBuyer?: UserSeed;
  auctionId: string;
  orderId: string;
  orderNumber: string;
  bidId: string;
  secondBidId?: string;
  holdId: string;
  totalAmount: number;
  sellerPayout: number;
};

const databaseUrl = process.env.DATABASE_URL || '';

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  return Number(value.toString());
};

const unique = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const phone = (suffix: number) => `+23480${String(suffix).padStart(8, '0')}`;

const shippingAddress = {
  full_name: 'Payment E2E Buyer',
  phone_number: '+2348012345678',
  address_line1: '1 Test Street',
  city: 'Ikeja',
  state: 'Lagos',
  country: 'Nigeria',
};

const requireTestDatabase = () => {
  assert(
    databaseUrl.includes('_payment_e2e'),
    'DATABASE_URL must point to a throwaway payment E2E database containing _payment_e2e'
  );
};

const resetDatabase = async () => {
  await query(`
    TRUNCATE TABLE
      audit_logs,
      user_risk_flags,
      disputes,
      notifications,
      payment_transactions,
      wallet_transactions,
      bid_holds,
      bids,
      orders,
      auctions,
      gadgets,
      gadget_categories,
      support_messages,
      support_threads,
      user_verifications,
      refresh_tokens,
      wallets,
      users
    RESTART IDENTITY CASCADE
  `);
};

const createUser = async (
  role: 'bidder' | 'seller',
  suffix: number,
  balance = 0
): Promise<UserSeed> => {
  const user = await prisma.user.create({
    data: {
      phoneNumber: phone(suffix),
      email: `payment-e2e-${suffix}@example.test`,
      fullName: `Payment E2E ${role} ${suffix}`,
      passwordHash: 'test-password-hash',
      role,
      isVerified: true,
      isActive: true,
      wallet: {
        create: {
          balance,
          currency: 'NGN',
          isLocked: false,
        },
      },
    },
    include: { wallet: true },
  });

  assert(user.wallet?.id, `Wallet was not created for ${role}`);
  return { id: user.id, walletId: user.wallet!.id };
};

const createOrderFixture = async (
  suffix: number,
  options: {
    buyerBalance: number;
    totalAmount: number;
    holdAmount?: number;
    paymentStatus?: 'pending' | 'paid' | 'refunded';
    fulfillmentStatus?:
      | 'pending'
      | 'processing'
      | 'sent_to_backoffice'
      | 'received_by_backoffice'
      | 'shipped'
      | 'delivered'
      | 'cancelled';
    payoutStatus?: 'pending' | 'ready' | 'held' | 'paid';
    secondBidAmount?: number;
    createdAt?: Date;
  }
): Promise<OrderFixture> => {
  const seller = await createUser('seller', suffix * 10 + 1, 0);
  const buyer = await createUser(
    'bidder',
    suffix * 10 + 2,
    options.buyerBalance
  );
  const secondBuyer = options.secondBidAmount
    ? await createUser('bidder', suffix * 10 + 3, options.buyerBalance)
    : undefined;
  const holdAmount = options.holdAmount ?? 1000;
  const totalAmount = options.totalAmount;
  const platformFee = totalAmount * 0.05;
  const sellerPayout = totalAmount - platformFee;

  const category = await prisma.gadgetCategory.create({
    data: {
      name: `Payment E2E Category ${suffix}`,
      slug: unique(`payment-e2e-category-${suffix}`),
      isActive: true,
    },
  });

  const gadget = await prisma.gadget.create({
    data: {
      sellerId: seller.id,
      categoryId: category.id,
      title: `Payment E2E Gadget ${suffix}`,
      description: 'Payment E2E test gadget',
      condition: 'excellent',
      images: ['https://example.test/gadget.jpg'],
      status: 'sold',
    },
  });

  const auction = await prisma.auction.create({
    data: {
      gadgetId: gadget.id,
      sellerId: seller.id,
      startingPrice: totalAmount - 1000,
      currentPrice: totalAmount,
      startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
      endTime: new Date(Date.now() - 60 * 60 * 1000),
      status: 'ended',
      winnerId: buyer.id,
      totalBids: 1,
    },
  });

  const bid = await prisma.bid.create({
    data: {
      auctionId: auction.id,
      bidderId: buyer.id,
      amount: totalAmount,
      isWinning: true,
      status: 'won',
    },
  });

  const secondBid = secondBuyer
    ? await prisma.bid.create({
        data: {
          auctionId: auction.id,
          bidderId: secondBuyer.id,
          amount: options.secondBidAmount!,
          isWinning: false,
          status: 'active',
          bidTime: new Date(Date.now() - 90 * 60 * 1000),
        },
      })
    : undefined;

  const hold = await prisma.bidHold.create({
    data: {
      bidId: bid.id,
      walletId: buyer.walletId,
      amount: holdAmount,
      status: 'held',
    },
  });

  const order = await prisma.order.create({
    data: {
      auctionId: auction.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      orderNumber: `PAY-E2E-${suffix}-${Date.now()}`,
      totalAmount,
      platformFee,
      sellerPayout,
      paymentStatus: options.paymentStatus ?? 'pending',
      fulfillmentStatus: options.fulfillmentStatus ?? 'pending',
      payoutStatus: options.payoutStatus ?? 'pending',
      shippingAddress,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    },
  });

  return {
    seller,
    buyer,
    secondBuyer,
    auctionId: auction.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    bidId: bid.id,
    secondBidId: secondBid?.id,
    holdId: hold.id,
    totalAmount,
    sellerPayout,
  };
};

const walletBalance = async (userId: string) => {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  return toNumber(wallet.balance);
};

const walletTransactionCount = async (
  walletId: string,
  transactionType: string,
  reference?: string
) =>
  prisma.walletTransaction.count({
    where: {
      walletId,
      transactionType,
      ...(reference ? { reference } : {}),
    },
  });

const waitFor = async (
  assertion: () => Promise<boolean>,
  message: string,
  timeoutMs = 2000
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await assertion()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  throw new Error(message);
};

const testPaystackWebhookSignature = () => {
  const payload = JSON.stringify({
    event: 'charge.success',
    data: { reference: 'payment-e2e-signature' },
  });
  const validSignature = crypto
    .createHmac('sha512', config.paystack.secretKey)
    .update(payload)
    .digest('hex');

  assert(
    paystackService.verifyWebhookSignature(payload, validSignature),
    'Valid Paystack webhook signature was rejected'
  );
  assert(
    !paystackService.verifyWebhookSignature(payload, 'invalid-signature'),
    'Invalid Paystack webhook signature was accepted'
  );
};

const testWalletFunding = async () => {
  const user = await createUser('bidder', 101, 0);
  const reference = unique('wallet-funding');
  const amount = 25000;

  await prisma.paymentTransaction.create({
    data: {
      userId: user.id,
      paymentGateway: 'paystack',
      gatewayReference: reference,
      amount,
      currency: 'NGN',
      status: 'pending',
      metadata: { purpose: 'wallet_funding' },
    },
  });

  const first = await walletService.processWalletFunding({
    userId: user.id,
    reference,
    amount,
    gatewayResponse: { reference, channel: 'card', status: 'success' },
    source: 'webhook',
    gateway: 'paystack',
  });
  const second = await walletService.processWalletFunding({
    userId: user.id,
    reference,
    amount,
    gatewayResponse: { reference, channel: 'card', status: 'success' },
    source: 'verify',
    gateway: 'paystack',
  });

  assert(
    !first.alreadyProcessed,
    'First wallet funding was treated as duplicate'
  );
  assert(second.alreadyProcessed, 'Duplicate wallet funding was not detected');
  assert(
    (await walletBalance(user.id)) === amount,
    'Wallet funding balance is wrong'
  );
  assert(
    (await walletTransactionCount(user.walletId, 'deposit', reference)) === 1,
    'Duplicate wallet funding created more than one deposit transaction'
  );
};

const testPaystackOrderPayment = async () => {
  const fixture = await createOrderFixture(201, {
    buyerBalance: 1000,
    totalAmount: 150000,
  });
  const reference = unique('order-paystack');

  await prisma.paymentTransaction.create({
    data: {
      userId: fixture.buyer.id,
      paymentGateway: 'paystack',
      gatewayReference: reference,
      amount: fixture.totalAmount,
      currency: 'NGN',
      status: 'pending',
      metadata: {
        purpose: 'order_payment',
        order_id: fixture.orderId,
        order_number: fixture.orderNumber,
      },
    },
  });

  await orderService.processOrderPayment(
    fixture.orderId,
    reference,
    fixture.totalAmount,
    {
      reference,
      status: 'success',
    }
  );
  await orderService.processOrderPayment(
    fixture.orderId,
    reference,
    fixture.totalAmount,
    {
      reference,
      status: 'success',
    }
  );

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: fixture.orderId },
  });
  const hold = await prisma.bidHold.findUniqueOrThrow({
    where: { id: fixture.holdId },
  });
  const paymentTx = await prisma.paymentTransaction.findFirstOrThrow({
    where: { gatewayReference: reference },
  });

  assert(
    order.paymentStatus === 'paid',
    'Paystack order payment did not mark order paid'
  );
  assert(
    order.fulfillmentStatus === 'processing',
    'Paystack order payment did not move order to processing'
  );
  assert(
    hold.status === 'released',
    'Paystack order payment did not release bid hold'
  );
  assert(
    paymentTx.status === 'success',
    'Paystack order payment did not mark payment transaction successful'
  );
  assert(
    (await walletBalance(fixture.buyer.id)) === 1000,
    'Paystack order payment incorrectly changed buyer wallet balance'
  );
  assert(
    (await walletTransactionCount(fixture.buyer.walletId, 'bid_release')) === 1,
    'Duplicate Paystack order processing created duplicate bid release transactions'
  );
};

const testWalletOrderPaymentAndRefund = async () => {
  const fixture = await createOrderFixture(301, {
    buyerBalance: 201000,
    totalAmount: 200000,
  });

  await orderService.confirmPayment(fixture.orderId);
  const paidOrder = await prisma.order.findUniqueOrThrow({
    where: { id: fixture.orderId },
  });
  const releasedHold = await prisma.bidHold.findUniqueOrThrow({
    where: { id: fixture.holdId },
  });

  assert(
    paidOrder.paymentStatus === 'paid',
    'Wallet payment did not mark order paid'
  );
  assert(
    paidOrder.fulfillmentStatus === 'processing',
    'Wallet payment did not move order to processing'
  );
  assert(
    releasedHold.status === 'released',
    'Wallet payment did not release bid hold'
  );
  assert(
    (await walletBalance(fixture.buyer.id)) === 1000,
    'Wallet payment deducted wrong buyer amount'
  );
  assert(
    (await walletTransactionCount(
      fixture.buyer.walletId,
      'purchase',
      `${fixture.orderNumber}-BUYER-PAYMENT`
    )) === 1,
    'Wallet payment did not create exactly one purchase transaction'
  );

  await orderService.adminUpdateOrder(fixture.orderId, {
    payment_status: 'refunded',
  });
  await orderService.adminUpdateOrder(fixture.orderId, {
    payment_status: 'refunded',
  });

  const refundedOrder = await prisma.order.findUniqueOrThrow({
    where: { id: fixture.orderId },
  });

  assert(
    refundedOrder.paymentStatus === 'refunded',
    'Refund did not mark order refunded'
  );
  assert(
    (await walletBalance(fixture.buyer.id)) === 201000,
    'Refund did not restore buyer wallet balance'
  );
  assert(
    (await walletTransactionCount(
      fixture.buyer.walletId,
      'refund',
      fixture.orderNumber
    )) === 1,
    'Duplicate refund protection failed'
  );
};

const testPayoutRelease = async () => {
  const fixture = await createOrderFixture(401, {
    buyerBalance: 1000,
    totalAmount: 180000,
    paymentStatus: 'paid',
    fulfillmentStatus: 'processing',
  });

  await orderService.adminUpdateOrder(fixture.orderId, {
    fulfillment_status: 'delivered',
  });

  const readyOrder = await prisma.order.findUniqueOrThrow({
    where: { id: fixture.orderId },
  });
  assert(
    readyOrder.payoutStatus === 'ready',
    'Delivered paid order did not enter payout queue'
  );

  await orderService.adminUpdateOrder(fixture.orderId, {
    payout_status: 'paid',
    payout_reference: 'PAYMENT-E2E-PAYOUT',
  });
  await orderService.adminUpdateOrder(fixture.orderId, {
    payout_status: 'paid',
    payout_reference: 'PAYMENT-E2E-PAYOUT',
  });

  const paidOutOrder = await prisma.order.findUniqueOrThrow({
    where: { id: fixture.orderId },
  });

  assert(
    paidOutOrder.payoutStatus === 'paid',
    'Payout release did not mark payout paid'
  );
  assert(
    Boolean(paidOutOrder.payoutPaidAt),
    'Payout paid timestamp was not set'
  );
  assert(
    (await walletBalance(fixture.seller.id)) === fixture.sellerPayout,
    'Payout release credited wrong seller wallet amount'
  );
  assert(
    (await walletTransactionCount(
      fixture.seller.walletId,
      'sale',
      fixture.orderNumber
    )) === 1,
    'Duplicate payout protection failed'
  );
};

const testBidCommitmentPenaltyFlow = async () => {
  const secondBidAmount = 190000;
  const fixture = await createOrderFixture(501, {
    buyerBalance: BID_COMMITMENT_AMOUNT,
    totalAmount: 200000,
    secondBidAmount,
    createdAt: new Date(
      Date.now() - (BID_PAYMENT_DEADLINE_HOURS + 1) * 60 * 60 * 1000
    ),
  });

  assert(fixture.secondBuyer, 'Second bidder fixture was not created');
  assert(fixture.secondBidId, 'Second bid fixture was not created');

  const expiredCount = await orderService.expirePendingOrders();
  assert(expiredCount === 1, 'Expired unpaid order count was wrong');

  await waitFor(async () => {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
    });
    return order.buyerId === fixture.secondBuyer!.id;
  }, 'Second-place offer did not reassign the order');

  const [defaultedBuyer, defaultedWallet, chargedHold, reassignedOrder] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: fixture.buyer.id } }),
      prisma.wallet.findUniqueOrThrow({
        where: { id: fixture.buyer.walletId },
      }),
      prisma.bidHold.findUniqueOrThrow({ where: { id: fixture.holdId } }),
      prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
    ]);

  assert(
    defaultedBuyer.isActive === false,
    'Defaulted winning bidder was not suspended'
  );
  assert(
    defaultedWallet.isLocked === true,
    'Defaulted winning bidder wallet was not locked'
  );
  assert(
    toNumber(defaultedWallet.balance) === 0,
    'Defaulted winning bidder commitment was not deducted'
  );
  assert(
    chargedHold.status === 'charged',
    'Winning bid hold was not charged after missed payment'
  );

  const forfeiture = await prisma.walletTransaction.findFirst({
    where: {
      walletId: fixture.buyer.walletId,
      transactionType: 'fee',
      status: 'completed',
      amount: BID_COMMITMENT_AMOUNT,
    },
  });
  const penalty = await prisma.walletTransaction.findFirst({
    where: {
      walletId: fixture.buyer.walletId,
      transactionType: 'fee',
      status: 'pending',
      amount: BID_DEFAULT_PENALTY_AMOUNT,
    },
  });

  assert(
    Boolean(forfeiture),
    '₦1,000 bid commitment forfeiture was not created'
  );
  assert(Boolean(penalty), '₦5,000 pending penalty was not created');

  const [winningBid, secondBid, auction] = await Promise.all([
    prisma.bid.findUniqueOrThrow({ where: { id: fixture.bidId } }),
    prisma.bid.findUniqueOrThrow({ where: { id: fixture.secondBidId! } }),
    prisma.auction.findUniqueOrThrow({ where: { id: fixture.auctionId } }),
  ]);

  assert(
    winningBid.status === 'withdrawn' && winningBid.isWinning === false,
    'Defaulted winning bid was not withdrawn'
  );
  assert(
    secondBid.status === 'won' && secondBid.isWinning === true,
    'Second-place bid was not promoted to winning'
  );
  assert(
    auction.winnerId === fixture.secondBuyer!.id,
    'Auction winner was not changed to second-place bidder'
  );
  assert(
    reassignedOrder.buyerId === fixture.secondBuyer!.id,
    'Order buyer was not reassigned to second-place bidder'
  );
  assert(
    reassignedOrder.paymentStatus === 'pending' &&
      reassignedOrder.fulfillmentStatus === 'pending',
    'Second-place order was not reset to pending'
  );
  assert(
    toNumber(reassignedOrder.totalAmount) === secondBidAmount,
    'Second-place order amount was not set to second bid amount'
  );

  await waitFor(async () => {
    const riskFlagCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM user_risk_flags
      WHERE user_id = ${fixture.buyer.id}::uuid
        AND flag_type = 'missed_bid_payment'
        AND severity = 'critical'
        AND resolved_at IS NULL
    `;
    return Number(riskFlagCount[0]?.count || 0) === 1;
  }, 'Missed bid payment risk flag was not created');

  const secondPlaceNotification = await prisma.notification.findFirst({
    where: {
      userId: fixture.secondBuyer!.id,
      notificationType: 'auction_won',
      title: 'Second chance to buy',
    },
  });

  assert(
    Boolean(secondPlaceNotification),
    'Second-place bidder notification was not created'
  );
};

const tests: Array<[string, () => Promise<void> | void]> = [
  ['Paystack webhook signature verification', testPaystackWebhookSignature],
  ['Paystack wallet funding and duplicate protection', testWalletFunding],
  ['Paystack order payment and duplicate protection', testPaystackOrderPayment],
  ['Wallet order payment and refunds', testWalletOrderPaymentAndRefund],
  ['Payout ready and payout release', testPayoutRelease],
  [
    'Bid commitment penalty and second-place offer',
    testBidCommitmentPenaltyFlow,
  ],
];

const run = async () => {
  requireTestDatabase();
  await resetDatabase();

  for (const [name, test] of tests) {
    process.stdout.write(`• ${name} ... `);
    await test();
    process.stdout.write('ok\n');
  }
};

run()
  .then(async () => {
    await disconnectDatabase();
    process.stdout.write('Payment E2E harness passed\n');
    process.exit(0);
  })
  .catch(async error => {
    await disconnectDatabase().catch(() => undefined);
    console.error('Payment E2E harness failed');
    console.error(error);
    process.exit(1);
  });
