import fs from 'fs';
import prisma from '../../config/prisma';
import { Prisma } from '../../generated/prisma';
import { isSellerRole } from '@gadget-bidding/shared';
import { hashPassword } from '../../utils/password';
import { isOTPExpired } from '../../utils/otp';
import logger from '../../utils/logger';
import {
  USER_SELECT,
  issueTokensForUser,
  makeSyntheticPhone,
  startEmailSignup,
  toPublicUser,
} from '../auth/auth.service';
import { sellerCode } from '../buyer/sellerSummary.service';
import { createNotification, notifyAdmins } from '../notification/notification.service';
import { deletePrivateFile, privateFileUrl, storePrivateFile } from './privateFiles.service';

/* ------------------------------------------------------------------ */
/* What a seller application is made of                                */
/* ------------------------------------------------------------------ */

export const DOCUMENT_KINDS = ['cac_certificate', 'owner_id', 'shop_address'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  cac_certificate: 'CAC certificate',
  owner_id: "Owner's ID",
  shop_address: 'Proof of shop address',
};

/** How each document reads inside a sentence ("Add … first"). */
const DOCUMENT_PHRASES: Record<DocumentKind, string> = {
  cac_certificate: 'your CAC certificate',
  owner_id: "the owner's ID",
  shop_address: 'proof of your shop address',
};

export const SELLER_CATEGORIES = ['Phones', 'Laptops', 'Audio', 'Gaming', 'Wearables', 'Tablets'];

/** The six "How selling works" ticks, in screen order. */
export const SELLER_RULES = [
  'platform_fee',
  'hub_dropoff',
  'inspection',
  'paid_after_confirm',
  'name_hidden',
  'cant_buy',
] as const;

/** Rejected businesses can apply again after this many days. */
export const REAPPLY_AFTER_DAYS = 30;

type DocStatus = 'submitted' | 'accepted' | 'needs_fix';
type DocEntry = {
  file: string;
  name: string;
  mime: string;
  size: number;
  uploaded_at: string;
  status: DocStatus;
  note?: string | null;
  reviewed_at?: string | null;
};
type Docs = Partial<Record<DocumentKind, DocEntry>>;
type Application = Prisma.SellerApplicationGetPayload<{}>;

const docsOf = (app: Pick<Application, 'documents'>): Docs => (app.documents ?? {}) as Docs;
export const isDocumentKind = (k: string): k is DocumentKind => (DOCUMENT_KINDS as readonly string[]).includes(k);

/** 0803…, 803…, +234803… → +234803…; null when it isn't a Nigerian mobile number. */
const toPhone = (raw: string) => {
  const d = raw.replace(/\D/g, '');
  const phone = d.startsWith('234') ? `+${d}` : d.startsWith('0') ? `+234${d.slice(1)}` : `+234${d}`;
  return /^\+234[789][01]\d{8}$/.test(phone) ? phone : null;
};
/** +2348030000000 → "0803 000 0000" */
const localPhone = (p: string | null) =>
  p && p.startsWith('+234') ? `0${p.slice(4, 7)} ${p.slice(7, 10)} ${p.slice(10)}` : p;

export const registrationLabel = (type: string | null, number: string | null) =>
  type && number ? `${type.toUpperCase()} ${number}` : null;

/* ------------------------------------------------------------------ */
/* Sign-up: business email → code → password (the account is made here) */
/* ------------------------------------------------------------------ */

/** Seller accounts handle money: 10+ characters, a number and a capital letter. */
export const sellerPasswordProblem = (pw: string): string | null =>
  pw.length >= 10 && /[0-9]/.test(pw) && /[A-Z]/.test(pw)
    ? null
    : 'Use at least 10 characters, with a number and a capital letter.';

export const startSellerSignup = async (rawEmail: string) => {
  const email = rawEmail.trim().toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { role: true },
  });
  if (existing) {
    throw new Error(
      isSellerRole(existing.role)
        ? "There's already a seller account with this email. Log in instead."
        : 'This email is used for a buyer account. Use a different business email.'
    );
  }
  return startEmailSignup(email);
};

export const completeSellerSignup = async (data: { verification_id: string; password: string }) => {
  const problem = sellerPasswordProblem(data.password);
  if (problem) throw new Error(problem);
  const passwordHash = await hashPassword(data.password);
  const phoneNumber = await makeSyntheticPhone();

  return prisma.$transaction(async tx => {
    const v = await tx.userVerification.findFirst({
      where: { id: data.verification_id, verificationType: 'email', userId: null },
    });
    if (!v || !v.target || !v.isVerified) throw new Error('Confirm your business email first.');
    if (!v.expiresAt || isOTPExpired(v.expiresAt)) throw new Error('This sign-up has expired. Start again.');
    const email = v.target;

    const clash = await tx.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (clash) throw new Error('An account with this email already exists. Log in instead.');

    const user = await tx.user.create({
      data: {
        // The business phone is collected on the next step; a non-routable placeholder until then.
        phoneNumber,
        email,
        // The owner's name comes with the business details.
        fullName: '',
        passwordHash,
        role: 'seller',
        isVerified: true,
        wallet: { create: { balance: 0, currency: 'NGN' } },
        sellerApplication: { create: {} },
      },
      select: USER_SELECT,
    });
    await tx.userVerification.delete({ where: { id: v.id } });

    const { access_token, refresh_token } = await issueTokensForUser(user, tx);
    logger.info(`Seller signed up: ${user.id}`);
    return { access_token, refresh_token, user: toPublicUser(user) };
  });
};

/* ------------------------------------------------------------------ */
/* The seller's side                                                    */
/* ------------------------------------------------------------------ */

const getOrCreate = async (userId: string): Promise<Application> => {
  const app = await prisma.sellerApplication.findUnique({ where: { userId } });
  if (app) return app;
  // Seller accounts from before applications existed start with an empty one.
  return prisma.sellerApplication.create({ data: { userId } });
};

const forSeller = (app: Application) => {
  const docs = docsOf(app);
  const reapplyAt =
    app.status === 'rejected' && app.decidedAt
      ? new Date(app.decidedAt.getTime() + REAPPLY_AFTER_DAYS * 86_400_000).toISOString()
      : null;
  return {
    status: app.status,
    seller_code: sellerCode(app.userId),
    business_name: app.businessName,
    owner_name: app.ownerName,
    plaza: app.plaza,
    shop_number: app.shopNumber,
    business_phone: localPhone(app.businessPhone),
    area: app.area,
    categories: app.categories,
    registration_type: app.registrationType,
    registration_number: app.registrationNumber,
    number_check: app.numberCheck,
    documents: DOCUMENT_KINDS.map(kind => {
      const d = docs[kind];
      return {
        kind,
        label: DOCUMENT_LABELS[kind],
        uploaded: !!d,
        name: d?.name ?? null,
        mime: d?.mime ?? null,
        uploaded_at: d?.uploaded_at ?? null,
        status: d?.status ?? null,
        note: d?.status === 'needs_fix' ? d.note ?? null : null,
      };
    }),
    rules_accepted_at: app.rulesAcceptedAt?.toISOString() ?? null,
    submitted_at: app.submittedAt?.toISOString() ?? null,
    resubmitted_at: app.resubmittedAt?.toISOString() ?? null,
    decided_at: app.decidedAt?.toISOString() ?? null,
    team_note: app.status === 'needs_info' ? app.teamNote : null,
    reject_reason: app.status === 'rejected' ? app.rejectReason : null,
    second_review_requested_at: app.secondReviewRequestedAt?.toISOString() ?? null,
    can_request_second_review: app.status === 'rejected' && !app.secondReviewRequestedAt,
    reapply_at: reapplyAt,
    approval_seen: !!app.approvalSeenAt,
  };
};
export type SellerApplicationView = ReturnType<typeof forSeller>;

export const getMyApplication = async (userId: string) => forSeller(await getOrCreate(userId));

const editableNow = (app: Application) => {
  if (app.status === 'draft') return 'all' as const;
  if (app.status === 'needs_info') return 'fixes' as const;
  return 'none' as const;
};

const clean = (v: unknown, max: number) => {
  if (v === undefined) return undefined;
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
};

/** Step 4 (business details) and the registration number on step 5. Saved as the seller goes. */
export const updateMyApplication = async (
  userId: string,
  body: {
    business_name?: string;
    owner_name?: string;
    plaza?: string;
    shop_number?: string;
    business_phone?: string;
    categories?: string[];
    registration_type?: string;
    registration_number?: string;
  }
) => {
  const app = await getOrCreate(userId);
  const mode = editableNow(app);
  if (mode === 'none') throw new Error('Your application is with our team, so it can’t be changed right now.');

  const data: Prisma.SellerApplicationUpdateInput = {};
  const touchesNumber = body.registration_type !== undefined || body.registration_number !== undefined;

  if (mode === 'fixes') {
    const other = ['business_name', 'owner_name', 'plaza', 'shop_number', 'business_phone', 'categories'].some(
      k => (body as Record<string, unknown>)[k] !== undefined
    );
    if (other || (touchesNumber && app.numberCheck !== 'not_matched')) {
      throw new Error('Only the items our team asked about can be changed.');
    }
  }

  if (mode === 'all') {
    const businessName = clean(body.business_name, 255);
    const ownerName = clean(body.owner_name, 255);
    if (businessName !== undefined) data.businessName = businessName;
    if (ownerName !== undefined) data.ownerName = ownerName;
    const plaza = clean(body.plaza, 120);
    if (plaza !== undefined) data.plaza = plaza;
    const shop = clean(body.shop_number, 60);
    if (shop !== undefined) data.shopNumber = shop;
    if (body.business_phone !== undefined) {
      const raw = String(body.business_phone ?? '').trim();
      if (!raw) data.businessPhone = null;
      else {
        const phone = toPhone(raw);
        if (!phone) throw new Error('Enter a Nigerian mobile number, like 0803 000 0000.');
        data.businessPhone = phone;
      }
    }
    if (body.categories !== undefined) {
      const picked = Array.isArray(body.categories) ? body.categories.map(String) : [];
      const bad = picked.find(c => !SELLER_CATEGORIES.includes(c));
      if (bad) throw new Error(`"${bad}" isn't one of the categories we sell.`);
      data.categories = SELLER_CATEGORIES.filter(c => picked.includes(c));
    }
  }

  if (touchesNumber) {
    if (body.registration_type !== undefined) {
      const t = String(body.registration_type ?? '').toLowerCase();
      if (!['rc', 'bn'].includes(t)) throw new Error('Choose RC or BN.');
      data.registrationType = t;
    }
    if (body.registration_number !== undefined) {
      const raw = String(body.registration_number ?? '').replace(/^\s*(rc|bn)\s*/i, '').replace(/[\s-]/g, '');
      if (raw && !/^\d{4,8}$/.test(raw)) throw new Error('Registration numbers are 4 to 8 digits, like 1234567.');
      data.registrationNumber = raw || null;
    }
    // A changed number goes back to our team to check.
    if (mode === 'fixes') {
      data.numberCheck = 'pending';
      data.numberCheckedAt = null;
    }
  }

  const updated = await prisma.sellerApplication.update({ where: { id: app.id }, data });
  // Keep the account's name in step with the owner's name (staff screens show it; buyers never do).
  if (data.ownerName) await prisma.user.update({ where: { id: userId }, data: { fullName: data.ownerName as string } });
  return forSeller(updated);
};

/** Step 5: one file per document. Photo or PDF. While we need info, only the documents we flagged. */
export const uploadMyDocument = async (
  userId: string,
  kind: DocumentKind,
  file: { path: string; mimetype: string; size: number; originalname: string }
) => {
  const app = await getOrCreate(userId);
  const mode = editableNow(app);
  const docs = docsOf(app);
  const current = docs[kind];
  const refusal =
    mode === 'none'
      ? 'Your application is with our team, so documents can’t be changed right now.'
      : mode === 'fixes' && current?.status !== 'needs_fix'
        ? 'This document was already accepted.'
        : null;
  if (refusal) {
    await fs.promises.unlink(file.path).catch(() => {});
    throw new Error(refusal);
  }

  const stored = await storePrivateFile(file.path, file.mimetype, 'seller-docs');
  // Read again: the seller may have uploaded from two places at once.
  const fresh = await prisma.sellerApplication.findUniqueOrThrow({ where: { id: app.id } });
  const freshDocs = docsOf(fresh);
  const previous = freshDocs[kind];
  freshDocs[kind] = {
    file: stored,
    name: file.originalname.slice(0, 120) || DOCUMENT_LABELS[kind],
    mime: file.mimetype,
    size: file.size,
    uploaded_at: new Date().toISOString(),
    status: 'submitted',
    // Keep what we asked for, so the team sees it next to the new file.
    note: previous?.status === 'needs_fix' ? previous.note ?? null : null,
    reviewed_at: null,
  };
  const updated = await prisma.sellerApplication.update({
    where: { id: app.id },
    data: { documents: freshDocs as Prisma.InputJsonValue },
  });
  if (previous?.file && previous.file !== stored) deletePrivateFile(previous.file);
  return forSeller(updated);
};

const missingForSubmit = (app: Application) => {
  const docs = docsOf(app);
  const missing: string[] = [];
  if (!app.businessName) missing.push('your registered business name');
  if (!app.ownerName) missing.push("the owner's full name");
  if (!app.plaza) missing.push('the plaza or building');
  if (!app.shopNumber) missing.push('the shop number');
  if (!app.businessPhone) missing.push('a business phone');
  if (!app.categories.length) missing.push('what you sell');
  if (!app.registrationType || !app.registrationNumber) missing.push('your RC or BN number');
  for (const k of DOCUMENT_KINDS) if (!docs[k]) missing.push(DOCUMENT_PHRASES[k]);
  return missing;
};

const listOf = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Another seller already uses this number (and wasn't turned down). */
const numberInUse = async (app: Application) =>
  !!(await prisma.sellerApplication.findFirst({
    where: {
      id: { not: app.id },
      registrationType: app.registrationType,
      registrationNumber: app.registrationNumber,
      status: { in: ['in_review', 'needs_info', 'approved'] },
    },
    select: { id: true },
  }));

const syncUser = (userId: string, data: Prisma.UserUpdateInput) => prisma.user.update({ where: { id: userId }, data });

/** Step 6: all six rules ticked → off to our team. */
export const submitMyApplication = async (userId: string, rules: string[]) => {
  const app = await getOrCreate(userId);
  if (app.status !== 'draft') throw new Error('This application was already sent.');
  const missing = missingForSubmit(app);
  if (missing.length) throw new Error(`Add ${listOf(missing)} first.`);
  const ticked = new Set((rules ?? []).map(String));
  if (!SELLER_RULES.every(r => ticked.has(r))) throw new Error('Tick all 6 so we know you’ve read them.');
  if (await numberInUse(app)) {
    throw new Error(
      `${registrationLabel(app.registrationType, app.registrationNumber)} is already used by another seller account. Ask our team if that's wrong.`
    );
  }

  const now = new Date();
  const updated = await prisma.sellerApplication.update({
    where: { id: app.id },
    data: { status: 'in_review', submittedAt: now, rulesAcceptedAt: now },
  });
  await syncUser(userId, {
    sellerKybStatus: 'pending',
    sellerKybSubmittedAt: now,
    sellerKybReviewedAt: null,
    sellerKybRejectionReason: null,
    businessName: app.businessName,
    cacNumber: registrationLabel(app.registrationType, app.registrationNumber),
    fullName: app.ownerName ?? undefined,
    acceptedTermsAt: now,
  });
  notifyAdmins(
    'seller_application',
    'New seller application',
    `${app.businessName} · ${registrationLabel(app.registrationType, app.registrationNumber)}`,
    { application_id: app.id, route: `/sellers?application=${app.id}` }
  ).catch(err => logger.error('Notify admins of seller application failed:', err));
  logger.info(`Seller application sent: ${app.id}`);
  return forSeller(updated);
};

/** "Send for review" after fixing what we asked for. Keeps its place in the queue. */
export const resubmitMyApplication = async (userId: string) => {
  const app = await getOrCreate(userId);
  if (app.status !== 'needs_info') throw new Error('There’s nothing to send right now.');
  const docs = docsOf(app);
  const stillToFix = DOCUMENT_KINDS.filter(k => docs[k]?.status === 'needs_fix').map(k => DOCUMENT_PHRASES[k]);
  if (app.numberCheck === 'not_matched') stillToFix.push(`your ${app.registrationType === 'bn' ? 'BN' : 'RC'} number`);
  if (stillToFix.length) throw new Error(`Fix ${listOf(stillToFix)} first.`);
  if (await numberInUse(app)) {
    throw new Error(
      `${registrationLabel(app.registrationType, app.registrationNumber)} is already used by another seller account. Ask our team if that's wrong.`
    );
  }

  const updated = await prisma.sellerApplication.update({
    where: { id: app.id },
    data: { status: 'in_review', resubmittedAt: new Date() },
  });
  await syncUser(userId, {
    sellerKybStatus: 'pending',
    cacNumber: registrationLabel(app.registrationType, app.registrationNumber),
  });
  notifyAdmins('seller_application', 'Seller sent their fix', `${app.businessName} is ready for another look`, {
    application_id: app.id,
    route: `/sellers?application=${app.id}`,
  }).catch(err => logger.error('Notify admins of seller fix failed:', err));
  return forSeller(updated);
};

/** "Ask for a second review" — once per decision. Someone else on the team looks again. */
export const requestSecondReview = async (userId: string) => {
  const app = await getOrCreate(userId);
  if (app.status !== 'rejected') throw new Error('There’s nothing to review again.');
  if (app.secondReviewRequestedAt) throw new Error('You already asked for a second review of this decision.');
  const updated = await prisma.sellerApplication.update({
    where: { id: app.id },
    data: { status: 'in_review', secondReviewRequestedAt: new Date() },
  });
  await syncUser(userId, { sellerKybStatus: 'pending', sellerKybRejectionReason: null });
  notifyAdmins('seller_application', 'Second review asked for', `${app.businessName} thinks we got it wrong`, {
    application_id: app.id,
    route: `/sellers?application=${app.id}`,
  }).catch(err => logger.error('Notify admins of second review failed:', err));
  return forSeller(updated);
};

/** 30 days after a turn-down, start again with what they sent before (every item is checked afresh). */
export const reapplyMyApplication = async (userId: string) => {
  const app = await getOrCreate(userId);
  if (app.status !== 'rejected') throw new Error('There’s nothing to start again.');
  const opensAt = app.decidedAt ? app.decidedAt.getTime() + REAPPLY_AFTER_DAYS * 86_400_000 : 0;
  if (Date.now() < opensAt) {
    const day = new Date(opensAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' });
    throw new Error(`You can apply again from ${day}.`);
  }
  const docs = docsOf(app);
  for (const k of DOCUMENT_KINDS) {
    const d = docs[k];
    if (d) docs[k] = { ...d, status: 'submitted', note: null, reviewed_at: null };
  }
  const updated = await prisma.sellerApplication.update({
    where: { id: app.id },
    data: {
      status: 'draft',
      documents: docs as Prisma.InputJsonValue,
      numberCheck: 'pending',
      numberCheckedAt: null,
      submittedAt: null,
      resubmittedAt: null,
      decidedAt: null,
      rulesAcceptedAt: null,
      teamNote: null,
      rejectReason: null,
      secondReviewRequestedAt: null,
    },
  });
  await syncUser(userId, { sellerKybStatus: 'not_started', sellerKybRejectionReason: null });
  return forSeller(updated);
};

/** The seller has seen "You're approved!" (it isn't shown again). */
export const markApprovalSeen = async (userId: string) => {
  const app = await getOrCreate(userId);
  if (app.status !== 'approved') return forSeller(app);
  const updated = app.approvalSeenAt
    ? app
    : await prisma.sellerApplication.update({ where: { id: app.id }, data: { approvalSeenAt: new Date() } });
  return forSeller(updated);
};

/* ------------------------------------------------------------------ */
/* Our team's side                                                      */
/* ------------------------------------------------------------------ */

export type TeamStatusFilter = 'in_review' | 'needs_info' | 'approved' | 'rejected' | 'draft' | 'all';

export const listForTeam = async (opts: { status: TeamStatusFilter; search?: string; page: number; limit: number }) => {
  const search = opts.search?.trim();
  const digits = search?.replace(/\D/g, '');
  const where: Prisma.SellerApplicationWhereInput = {
    ...(opts.status === 'all' ? { status: { not: 'draft' } } : { status: opts.status }),
    ...(search
      ? {
          OR: [
            { businessName: { contains: search, mode: 'insensitive' } },
            { ownerName: { contains: search, mode: 'insensitive' } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
            ...(digits ? [{ registrationNumber: { contains: digits } }] : []),
          ],
        }
      : {}),
  };
  const [rows, total, grouped] = await Promise.all([
    prisma.sellerApplication.findMany({
      where,
      include: { user: { select: { email: true } } },
      // The oldest first while it waits; the latest first once decided.
      orderBy: ['in_review', 'needs_info'].includes(opts.status)
        ? [{ submittedAt: 'asc' }]
        : [{ updatedAt: 'desc' }],
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
    prisma.sellerApplication.count({ where }),
    prisma.sellerApplication.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(grouped.map(g => [g.status, g._count._all])) as Record<string, number>;
  return {
    items: rows.map(a => {
      const docs = docsOf(a);
      return {
        id: a.id,
        user_id: a.userId,
        seller_code: sellerCode(a.userId),
        status: a.status,
        business_name: a.businessName,
        owner_name: a.ownerName,
        email: a.user.email,
        registration: registrationLabel(a.registrationType, a.registrationNumber),
        number_check: a.numberCheck,
        documents: {
          uploaded: DOCUMENT_KINDS.filter(k => docs[k]).length,
          accepted: DOCUMENT_KINDS.filter(k => docs[k]?.status === 'accepted').length,
          needs_fix: DOCUMENT_KINDS.filter(k => docs[k]?.status === 'needs_fix').length,
        },
        submitted_at: a.submittedAt?.toISOString() ?? null,
        resubmitted_at: a.resubmittedAt?.toISOString() ?? null,
        second_review: !!a.secondReviewRequestedAt,
        decided_at: a.decidedAt?.toISOString() ?? null,
      };
    }),
    total,
    counts: {
      in_review: counts.in_review ?? 0,
      needs_info: counts.needs_info ?? 0,
      approved: counts.approved ?? 0,
      rejected: counts.rejected ?? 0,
      draft: counts.draft ?? 0,
    },
  };
};

const findForTeam = async (id: string) => {
  const app = await prisma.sellerApplication.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, createdAt: true, isActive: true } },
      reviewer: { select: { fullName: true } },
    },
  });
  if (!app) throw new Error('Application not found');
  return app;
};

const forTeam = (app: Awaited<ReturnType<typeof findForTeam>>) => {
  const docs = docsOf(app);
  return {
    id: app.id,
    user_id: app.userId,
    seller_code: sellerCode(app.userId),
    status: app.status,
    email: app.user.email,
    account_created_at: app.user.createdAt?.toISOString() ?? null,
    account_active: app.user.isActive ?? true,
    business_name: app.businessName,
    owner_name: app.ownerName,
    plaza: app.plaza,
    shop_number: app.shopNumber,
    business_phone: localPhone(app.businessPhone),
    area: app.area,
    categories: app.categories,
    registration_type: app.registrationType,
    registration_number: app.registrationNumber,
    registration: registrationLabel(app.registrationType, app.registrationNumber),
    number_check: app.numberCheck,
    number_checked_at: app.numberCheckedAt?.toISOString() ?? null,
    documents: DOCUMENT_KINDS.map(kind => {
      const d = docs[kind];
      const isPdf = d?.mime === 'application/pdf';
      return {
        kind,
        label: DOCUMENT_LABELS[kind],
        uploaded: !!d,
        name: d?.name ?? null,
        mime: d?.mime ?? null,
        size: d?.size ?? null,
        uploaded_at: d?.uploaded_at ?? null,
        status: d?.status ?? null,
        note: d?.note ?? null,
        reviewed_at: d?.reviewed_at ?? null,
        is_pdf: isPdf,
        // Links last 10 minutes; reopen the application for fresh ones.
        url: d ? privateFileUrl(d.file) : null,
        preview_url: d ? privateFileUrl(d.file, { asImage: true }) : null,
      };
    }),
    rules_accepted_at: app.rulesAcceptedAt?.toISOString() ?? null,
    submitted_at: app.submittedAt?.toISOString() ?? null,
    resubmitted_at: app.resubmittedAt?.toISOString() ?? null,
    decided_at: app.decidedAt?.toISOString() ?? null,
    reviewed_by: app.reviewer?.fullName ?? null,
    team_note: app.teamNote,
    reject_reason: app.rejectReason,
    second_review_requested_at: app.secondReviewRequestedAt?.toISOString() ?? null,
  };
};

export const getForTeam = async (id: string) => forTeam(await findForTeam(id));

const mustBeInReview = (app: { status: string }) => {
  if (app.status !== 'in_review') throw new Error('Only applications waiting for review can be changed.');
};

/** We checked the RC / BN number against the CAC register. */
export const setNumberCheck = async (adminId: string, id: string, result: 'matched' | 'not_matched') => {
  const app = await findForTeam(id);
  mustBeInReview(app);
  await prisma.sellerApplication.update({
    where: { id },
    data: { numberCheck: result, numberCheckedAt: new Date(), reviewedById: adminId },
  });
  return getForTeam(id);
};

/** Accept a document, or ask for a new one with a note the seller sees. */
export const reviewDocument = async (
  adminId: string,
  id: string,
  kind: DocumentKind,
  input: { status: 'accepted' | 'needs_fix'; note?: string }
) => {
  const app = await findForTeam(id);
  mustBeInReview(app);
  const docs = docsOf(app);
  const d = docs[kind];
  if (!d) throw new Error(`There's no ${DOCUMENT_LABELS[kind]} to review.`);
  const note = input.note?.trim().slice(0, 300) || null;
  if (input.status === 'needs_fix' && (!note || note.length < 5)) {
    throw new Error('Say what the seller should fix (they see this).');
  }
  docs[kind] = {
    ...d,
    status: input.status,
    note: input.status === 'needs_fix' ? note : null,
    reviewed_at: new Date().toISOString(),
  };
  await prisma.sellerApplication.update({
    where: { id },
    data: { documents: docs as Prisma.InputJsonValue, reviewedById: adminId },
  });
  return getForTeam(id);
};

const tellSeller = (userId: string, title: string, message: string, status: string) =>
  createNotification(userId, 'seller_application', title, message, { status, route: 'SellerStatus' }, [
    'push',
    'email',
  ]).catch(err => logger.error('Seller application notification failed:', err));

export const approveApplication = async (adminId: string, id: string) => {
  const app = await findForTeam(id);
  mustBeInReview(app);
  const docs = docsOf(app);
  const notAccepted = DOCUMENT_KINDS.filter(k => docs[k]?.status !== 'accepted').map(k => `the ${DOCUMENT_LABELS[k]}`);
  if (app.numberCheck !== 'matched') throw new Error('Match the registration number with CAC first.');
  if (notAccepted.length) throw new Error(`Accept ${listOf(notAccepted)} first.`);

  const now = new Date();
  await prisma.sellerApplication.update({
    where: { id },
    data: { status: 'approved', decidedAt: now, reviewedById: adminId, teamNote: null, rejectReason: null },
  });
  await syncUser(app.userId, {
    sellerKybStatus: 'approved',
    sellerKybReviewedAt: now,
    sellerKybRejectionReason: null,
  });
  tellSeller(
    app.userId,
    "You're approved!",
    `Your business is verified. Buyers will see you as Verified seller ${sellerCode(app.userId)}.`,
    'approved'
  );
  return getForTeam(id);
};

/** Send it back with a note; the seller fixes only what we flagged and keeps their place. */
export const requestMoreInfo = async (adminId: string, id: string, rawNote: string) => {
  const app = await findForTeam(id);
  mustBeInReview(app);
  const note = rawNote.trim().slice(0, 500);
  if (note.length < 10) throw new Error('Write a short note for the seller (at least 10 characters).');
  const docs = docsOf(app);
  // Every item gets a verdict first, so the seller sees exactly what's accepted and what to fix.
  if (DOCUMENT_KINDS.some(k => docs[k]?.status === 'submitted') || app.numberCheck === 'pending') {
    throw new Error('Accept or flag every document and the number first.');
  }
  const flagged = DOCUMENT_KINDS.some(k => docs[k]?.status === 'needs_fix') || app.numberCheck === 'not_matched';
  if (!flagged) throw new Error('Mark what needs fixing first: a document, or the number as not matched.');

  const now = new Date();
  await prisma.sellerApplication.update({
    where: { id },
    data: { status: 'needs_info', teamNote: note, decidedAt: now, reviewedById: adminId },
  });
  await syncUser(app.userId, { sellerKybStatus: 'needs_info', sellerKybReviewedAt: now });
  tellSeller(
    app.userId,
    'One more thing',
    "We couldn't finish checking your business. Open the app to see what to fix.",
    'needs_info'
  );
  return getForTeam(id);
};

export const rejectApplication = async (adminId: string, id: string, rawReason: string) => {
  const app = await findForTeam(id);
  mustBeInReview(app);
  const reason = rawReason.trim().slice(0, 1000);
  if (reason.length < 10) throw new Error('Give the seller a reason (at least 10 characters).');

  const now = new Date();
  await prisma.sellerApplication.update({
    where: { id },
    data: { status: 'rejected', rejectReason: reason, teamNote: null, decidedAt: now, reviewedById: adminId },
  });
  await syncUser(app.userId, {
    sellerKybStatus: 'rejected',
    sellerKybReviewedAt: now,
    sellerKybRejectionReason: reason,
  });
  tellSeller(
    app.userId,
    "We couldn't approve your business",
    "Open the app to see why, and what you can do next.",
    'rejected'
  );
  return getForTeam(id);
};

/** For the old approve / reject buttons on a seller's profile: same rules as the review screen. */
export const applicationIdForUser = async (userId: string) =>
  (await prisma.sellerApplication.findUnique({ where: { userId }, select: { id: true } }))?.id ?? null;
