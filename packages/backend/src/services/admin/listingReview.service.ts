/**
 * One listing as our team reviews it (admin Listing review). This is the only place the full
 * IMEI / serial leaves the database.
 */
import prisma from '../../config/prisma';
import { listingDisclosures, profileByKey } from '@gadget-bidding/shared';
import { sellerCode } from '../buyer/sellerSummary.service';
import { identifierMatches } from '../gadget/listing.service';

const num = (v: unknown) => (v == null ? null : Number(v));

export const getListingForReview = async (gadgetId: string) => {
  const g = await prisma.gadget.findUnique({
    where: { id: gadgetId },
    omit: { deviceIdentifier: false, deviceIdentifierHash: false },
    include: {
      category: { select: { name: true, slug: true } },
      seller: { select: { id: true, fullName: true, phoneNumber: true, email: true } },
      auctions: {
        select: { id: true, status: true, currentPrice: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!g) return null;

  const specs = (g.specifications ?? {}) as Record<string, any>;
  const profile = profileByKey(typeof specs.profile === 'string' ? specs.profile : null);
  const { duplicate, matches } = await identifierMatches(g.id, g.deviceIdentifierHash, g.sellerId);

  return {
    id: g.id,
    title: g.title,
    description: g.description,
    brand: g.brand,
    model: g.model,
    condition: g.condition,
    images: g.images,
    status: g.status,
    rejection_reason: g.rejectionReason,
    created_at: g.createdAt?.toISOString() ?? null,
    updated_at: g.updatedAt?.toISOString() ?? null,
    category_name: g.category?.name ?? null,
    category_slug: g.category?.slug ?? null,
    specifications: specs,
    /** Made with the 8-step listing flow (specifications.profile is set). */
    is_listing_flow: !!profile,
    profile: profile?.key ?? null,
    profile_label: profile?.label ?? null,
    identifier_kind: profile?.identifier ?? null,
    device_identifier: g.deviceIdentifier,
    duplicate,
    identifier_matches: matches,
    disclosures: listingDisclosures(specs),
    seller_note: typeof specs.note === 'string' ? specs.note : null,
    seller_attested_at: g.sellerAttestedAt?.toISOString() ?? null,
    auction_settings: {
      starting_price: num(g.auctionStartingPrice),
      reserve_price: num(g.auctionReservePrice),
      buy_now_price: num(g.auctionBuyNowPrice),
      bid_increment: num(g.auctionBidIncrement),
      duration_hours: g.auctionDurationHours,
      start_now: g.auctionStartNow !== false,
    },
    seller: g.seller
      ? {
          id: g.seller.id,
          full_name: g.seller.fullName,
          phone_number: g.seller.phoneNumber,
          email: g.seller.email,
          seller_code: sellerCode(g.seller.id),
        }
      : null,
    auction: g.auctions[0]
      ? { id: g.auctions[0].id, status: g.auctions[0].status, current_price: Number(g.auctions[0].currentPrice) }
      : null,
  };
};
