#!/usr/bin/env node

const required = name => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const baseUrl = required('ADMIN_SMOKE_API_URL').replace(/\/$/, '');
const phoneNumber = required('ADMIN_SMOKE_PHONE');
const password = required('ADMIN_SMOKE_PASSWORD');
const timeoutMs = Number(process.env.ADMIN_SMOKE_TIMEOUT_MS || 15000);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const request = async (path, options = {}, token) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(
        `${options.method || 'GET'} ${path} failed (${response.status}): ${
          json.error || json.message || text
        }`
      );
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
};

const expectPaginated = (name, payload) => {
  assert(Array.isArray(payload.data), `${name} did not return data[]`);
  assert(payload.pagination, `${name} did not return pagination`);
  assert(
    typeof payload.pagination.page === 'number',
    `${name} pagination.page is missing`
  );
  assert(
    typeof payload.pagination.limit === 'number',
    `${name} pagination.limit is missing`
  );
  assert(
    typeof payload.pagination.total === 'number',
    `${name} pagination.total is missing`
  );
};

const smoke = async () => {
  const startedAt = Date.now();

  process.stdout.write('• Admin login ... ');
  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      phone_number: phoneNumber,
      password,
    }),
  });
  const token = login.data?.access_token;
  const refreshToken = login.data?.refresh_token;
  assert(token, 'Login did not return access_token');
  assert(login.data?.user?.role === 'admin', 'Login account is not an admin');
  process.stdout.write('ok\n');

  process.stdout.write('• Admin session /me ... ');
  const me = await request('/auth/me', {}, token);
  assert(me.data?.role === 'admin', '/auth/me did not return admin user');
  process.stdout.write('ok\n');

  if (refreshToken) {
    process.stdout.write('• Admin refresh token ... ');
    const refreshed = await request('/auth/refresh-token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    assert(refreshed.data?.access_token, 'Refresh did not return access_token');
    process.stdout.write('ok\n');
  }

  process.stdout.write('• Dashboard stats ... ');
  const stats = await request('/admin/stats', {}, token);
  assert(stats.success === true, 'Stats response was not successful');
  assert(stats.data && typeof stats.data === 'object', 'Stats data is missing');
  process.stdout.write('ok\n');

  const pages = [
    ['activity', '/admin/activity?page=1&limit=5'],
    ['gadgets', '/admin/gadgets?page=1&limit=5'],
    ['pending gadgets', '/admin/gadgets/pending?page=1&limit=5'],
    ['auctions', '/admin/auctions?page=1&limit=5'],
    ['orders', '/admin/orders?page=1&limit=5'],
    ['users', '/admin/users?page=1&limit=5'],
    ['disputes', '/admin/disputes?page=1&limit=5'],
    ['payments', '/admin/payments?page=1&limit=5'],
    ['audit logs', '/admin/audit-logs?page=1&limit=5'],
    ['support threads', '/admin/support/threads?page=1&limit=5'],
    ['notifications', '/notifications?page=1&limit=5'],
  ];

  const pageResults = new Map();
  for (const [name, path] of pages) {
    process.stdout.write(`• ${name} page ... `);
    const payload = await request(path, {}, token);
    expectPaginated(name, payload);
    pageResults.set(name, payload);
    process.stdout.write('ok\n');
  }

  process.stdout.write('• Notification unread count ... ');
  const unread = await request('/notifications/unread-count', {}, token);
  assert(
    typeof unread.data?.unread_count === 'number',
    'Unread count did not return a number'
  );
  process.stdout.write('ok\n');

  const users = pageResults.get('users')?.data || [];
  const seller = users.find(user => user.role === 'seller');
  if (seller?.id) {
    process.stdout.write('• Seller profile modal data ... ');
    const profile = await request(
      `/admin/users/${seller.id}/seller-profile`,
      {},
      token
    );
    assert(
      profile.data?.user?.id === seller.id,
      'Seller profile user mismatch'
    );
    assert(
      Array.isArray(profile.data?.latest_gadgets),
      'Seller profile latest_gadgets missing'
    );
    process.stdout.write('ok\n');
  } else {
    process.stdout.write(
      '• Seller profile modal data ... skipped (no seller on first page)\n'
    );
  }

  const supportThread = pageResults.get('support threads')?.data?.[0];
  if (supportThread?.id) {
    process.stdout.write('• Support messages page ... ');
    const messages = await request(
      `/admin/support/threads/${supportThread.id}/messages?page=1&limit=10`,
      {},
      token
    );
    expectPaginated('support messages', messages);
    process.stdout.write('ok\n');
  } else {
    process.stdout.write(
      '• Support messages page ... skipped (no support thread)\n'
    );
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stdout.write(`Admin launch smoke passed in ${elapsed}s\n`);
};

smoke().catch(error => {
  console.error('Admin launch smoke failed');
  console.error(error);
  process.exit(1);
});
