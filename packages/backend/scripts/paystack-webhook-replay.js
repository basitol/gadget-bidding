#!/usr/bin/env node

const crypto = require('crypto');

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const next = process.argv[index + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
    } else {
      args.set(key, next);
      index += 1;
    }
  }
}

const get = (argName, envName, fallback = '') =>
  args.get(argName) || process.env[envName] || fallback;

const fail = message => {
  console.error(message);
  process.exit(1);
};

const webhookUrl = get('url', 'PAYSTACK_REPLAY_WEBHOOK_URL');
const secret = get('secret', 'PAYSTACK_REPLAY_SECRET');
const reference = get('reference', 'PAYSTACK_REPLAY_REFERENCE');
const amount = Number(get('amount', 'PAYSTACK_REPLAY_AMOUNT'));
const purpose = get('purpose', 'PAYSTACK_REPLAY_PURPOSE', 'wallet_funding');
const userId = get('user-id', 'PAYSTACK_REPLAY_USER_ID');
const orderId = get('order-id', 'PAYSTACK_REPLAY_ORDER_ID');
const orderNumber = get('order-number', 'PAYSTACK_REPLAY_ORDER_NUMBER');
const currency = get('currency', 'PAYSTACK_REPLAY_CURRENCY', 'NGN');
const dryRun =
  args.has('dry-run') || process.env.PAYSTACK_REPLAY_DRY_RUN === 'true';
const allowProduction =
  args.has('allow-production') ||
  process.env.PAYSTACK_REPLAY_ALLOW_PRODUCTION === 'true';

if (!webhookUrl) fail('PAYSTACK_REPLAY_WEBHOOK_URL or --url is required');
if (!secret) fail('PAYSTACK_REPLAY_SECRET or --secret is required');
if (!reference) fail('PAYSTACK_REPLAY_REFERENCE or --reference is required');
if (!Number.isFinite(amount) || amount <= 0) {
  fail('PAYSTACK_REPLAY_AMOUNT or --amount must be a positive Naira amount');
}
if (!['wallet_funding', 'order_payment'].includes(purpose)) {
  fail('--purpose must be wallet_funding or order_payment');
}
if (purpose === 'order_payment' && !orderId) {
  fail('PAYSTACK_REPLAY_ORDER_ID or --order-id is required for order_payment');
}

const parsedUrl = new URL(webhookUrl);
if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
  fail('Webhook URL must be HTTPS unless replaying to localhost');
}

const productionLike =
  !/staging|stage|localhost|127\.0\.0\.1|dev|preview/i.test(webhookUrl);
if (productionLike && !allowProduction) {
  fail(
    'Refusing production-looking webhook URL. Use a staging URL or pass --allow-production deliberately.'
  );
}

const metadata =
  purpose === 'order_payment'
    ? {
        purpose,
        order_id: orderId,
        ...(orderNumber ? { order_number: orderNumber } : {}),
        ...(userId ? { user_id: userId } : {}),
      }
    : {
        purpose,
        ...(userId ? { user_id: userId } : {}),
      };

const payload = {
  event: 'charge.success',
  data: {
    id: Math.floor(Date.now() / 1000),
    domain: productionLike ? 'live' : 'test',
    status: 'success',
    reference,
    amount: Math.round(amount * 100),
    currency,
    paid_at: new Date().toISOString(),
    channel: 'card',
    gateway_response: 'Successful',
    metadata,
  },
};

const rawBody = JSON.stringify(payload);
const signature = crypto
  .createHmac('sha512', secret)
  .update(rawBody)
  .digest('hex');

const run = async () => {
  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          url: webhookUrl,
          signature,
          payload,
        },
        null,
        2
      )
    );
    return;
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-paystack-signature': signature,
      'user-agent': 'gadgetbid-paystack-webhook-replay/1.0',
    },
    body: rawBody,
  });

  const text = await response.text();
  if (!response.ok) {
    fail(`Replay failed (${response.status}): ${text}`);
  }

  console.log(`Replay accepted (${response.status}): ${text}`);
};

run().catch(error => {
  fail(error instanceof Error ? error.message : String(error));
});
