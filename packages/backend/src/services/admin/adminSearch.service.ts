import prisma from '../../config/prisma';
import { sellerCode } from '../buyer/sellerSummary.service';

/**
 * One search box for the team (the "page doesn't exist" screen): an order number, an email, name or
 * phone, a seller ID ("CV-1042") or a listing title. A few of each, newest first.
 */

const TAKE = 5;
const ROLE_PATH: Record<string, string> = { bidder: '/buyers', admin: '/admins' };
const PERSON = { id: true, fullName: true, email: true, role: true, businessName: true, staffOf: { select: { sellerId: true } } } as const;

export const searchEverything = async (raw: string) => {
  const q = raw.trim().slice(0, 100);
  if (q.length < 2) return { query: q, orders: [], users: [], listings: [] };

  const codeMatch = /^cv[-\s]?(\d{4})$/i.exec(q);
  const digits = q.replace(/\D/g, '');

  const [orders, people, listings, sellersByCode] = await Promise.all([
    prisma.order.findMany({
      where: {
        OR: [
          { orderNumber: { contains: q, mode: 'insensitive' } },
          ...(/^[0-9a-f-]{36}$/i.test(q) ? [{ id: q }] : []),
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        auction: { select: { gadget: { select: { title: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: TAKE,
    }),
    codeMatch
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: {
            deletedAt: null,
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { fullName: { contains: q, mode: 'insensitive' } },
              { businessName: { contains: q, mode: 'insensitive' } },
              ...(digits.length >= 7 ? [{ phoneNumber: { contains: digits.slice(-10) } }] : []),
            ],
          },
          select: PERSON,
          orderBy: { createdAt: 'desc' },
          take: TAKE,
        }),
    prisma.gadget.findMany({
      where: { title: { contains: q, mode: 'insensitive' } },
      select: { id: true, title: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: TAKE,
    }),
    // Seller IDs come from a hash of the account, so look through seller accounts for it.
    codeMatch
      ? prisma.user
          .findMany({
            where: { role: 'seller', deletedAt: null },
            select: PERSON,
          })
          .then(all => all.filter(u => sellerCode(u.id) === `CV-${codeMatch[1]}`).slice(0, TAKE))
      : Promise.resolve([]),
  ]);

  const users = [...sellersByCode, ...people].map(u => ({
    id: u.id,
    name: u.businessName || u.fullName || u.email || 'No name',
    email: u.email,
    role: u.role,
    seller_code: u.role === 'seller' ? sellerCode(u.id) : null,
    // Sellers open their profile; store staff open their store's; everyone else is found by email.
    path:
      u.role === 'seller'
        ? `/sellers?seller=${u.id}`
        : u.staffOf
          ? `/sellers?seller=${u.staffOf.sellerId}`
          : `${ROLE_PATH[u.role] ?? '/buyers'}?search=${encodeURIComponent(u.email || u.fullName || '')}`,
  }));

  return {
    query: q,
    orders: orders.map(o => ({
      id: o.id,
      order_number: o.orderNumber,
      title: o.auction?.gadget?.title ?? null,
      status: o.fulfillmentStatus ?? o.paymentStatus ?? null,
      path: `/orders?search=${encodeURIComponent(o.orderNumber)}`,
    })),
    users,
    listings: listings.map(g => ({
      id: g.id,
      title: g.title,
      status: g.status,
      path: `/gadgets?search=${encodeURIComponent(g.title)}`,
    })),
  };
};
