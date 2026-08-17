import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Eye,
  Gavel,
  PackageCheck,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { AdminSellerProfile, RiskFlag, adminApi } from '@/api';
import { label, money, when } from '@/lib/format';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import { mediaUrl } from '@/lib/media';
import {
  Badge,
  Empty,
  ErrorAlert,
  PageHeader,
  Pagination,
  Panel,
  SearchButton,
  SearchInput,
  SelectField,
  Toolbar,
  statusTone,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type UsersPageProps = {
  fixedRole?: 'bidder' | 'seller' | 'admin';
  title?: string;
  description?: string;
};

const riskTone = (severity?: string) => {
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'warn';
  return 'neutral';
};

function RiskFlags({
  flags,
  compact = false,
}: {
  flags?: RiskFlag[];
  compact?: boolean;
}) {
  if (!flags?.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {flags.map(flag => (
        <Badge
          key={flag.type}
          tone={riskTone(flag.severity)}
          className={compact ? 'text-[11px]' : undefined}
          title={flag.reason}
        >
          {flag.label}
          {flag.signal_count > 1 ? ` · ${flag.signal_count}` : ''}
        </Badge>
      ))}
    </div>
  );
}

export function UsersPage({
  fixedRole,
  title = 'Users',
  description = 'Roles, verification, wallet balances, and account controls.',
}: UsersPageProps = {}) {
  const { confirm, prompt } = useConfirmDialog();
  const [role, setRole] = useState(fixedRole || 'all');
  const [active, setActive] = useState('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedSeller, setSelectedSeller] =
    useState<AdminSellerProfile | null>(null);
  const [profileLoadingId, setProfileLoadingId] = useState<string | null>(null);
  const [profileActionId, setProfileActionId] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      role,
      active: active === 'all' ? undefined : active,
      search: appliedSearch,
      page,
      limit,
    }),
    [role, active, appliedSearch, page, limit]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.users(query);
      setItems(res.data || []);
      setTotal(res.pagination?.total || 0);
      setTotalPages(
        res.pagination?.totalPages || res.pagination?.total_pages || 1
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (
    id: string,
    body: {
      role?: string;
      is_active?: boolean;
      is_verified?: boolean;
      wallet_locked?: boolean;
    }
  ) => {
    setBusyId(id);
    try {
      await adminApi.updateUser(id, body);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const reactivateUser = async (user: any) => {
    const reference =
      (await prompt(
        `Penalty payment reference for ${user.full_name}`,
        user.pending_penalty?.id || '',
        { title: 'Reactivate account' }
      )) || undefined;
    const note =
      (await prompt('Optional recovery note', 'Penalty paid and verified', {
        title: 'Reactivate account',
      })) || undefined;

    setBusyId(user.id);
    setError('');
    try {
      await adminApi.reactivateUser(user.id, { reference, note });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const loadSellerProfile = async (id: string) => {
    setProfileLoadingId(id);
    setError('');
    try {
      const res = await adminApi.sellerProfile(id);
      setSelectedSeller(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProfileLoadingId(null);
    }
  };

  const openSellerProfile = (id: string) => {
    void loadSellerProfile(id);
  };

  const runProfileAction = async (
    actionId: string,
    action: () => Promise<unknown>
  ) => {
    if (!selectedSeller) return;
    setProfileActionId(actionId);
    setError('');
    try {
      await action();
      await loadSellerProfile(selectedSeller.user.id);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProfileActionId(null);
    }
  };

  const approveSellerGadget = (id: string) =>
    runProfileAction(id, () => adminApi.approveGadget(id));

  const rejectSellerGadget = async (id: string) => {
    const reason = await prompt('Rejection reason', 'Does not meet guidelines', {
      title: 'Reject listing',
      required: true,
    });
    if (!reason) return;
    void runProfileAction(id, () => adminApi.rejectGadget(id, reason));
  };

  const cancelSellerAuction = async (auction: {
    id: string;
    title: string;
    total_bids: number;
  }) => {
    const hasBids = Number(auction.total_bids || 0) > 0;
    const message = hasBids
      ? `Force-cancel "${auction.title}"? It has ${auction.total_bids} bid(s).`
      : `Cancel "${auction.title}"?`;
    if (
      !(await confirm({
        title: 'Cancel auction',
        description: message,
        danger: true,
        confirmLabel: 'Cancel auction',
      }))
    )
      return;
    void runProfileAction(auction.id, () =>
      adminApi.cancelAuction(auction.id, hasBids)
    );
  };

  const setSellerVerified = (verified: boolean) => {
    if (!selectedSeller) return;
    void runProfileAction(selectedSeller.user.id, () =>
      adminApi.updateUser(selectedSeller.user.id, { is_verified: verified })
    );
  };

  const setSellerWalletLocked = async (locked: boolean) => {
    if (!selectedSeller) return;
    const message = locked
      ? `Lock ${selectedSeller.user.full_name}'s wallet? They will not be able to use the balance until it is unlocked.`
      : `Unlock ${selectedSeller.user.full_name}'s wallet?`;
    if (
      !(await confirm({
        title: locked ? 'Lock wallet' : 'Unlock wallet',
        description: message,
        danger: locked,
      }))
    )
      return;
    void runProfileAction(selectedSeller.user.id, () =>
      adminApi.updateUser(selectedSeller.user.id, { wallet_locked: locked })
    );
  };

  const updateSellerDispute = async (id: string, nextStatus: string) => {
    const resolution =
      nextStatus === 'resolved' || nextStatus === 'rejected'
        ? (await prompt('Resolution notes', '', {
            title: label(nextStatus) + ' dispute',
          })) || undefined
        : undefined;
    void runProfileAction(id, () =>
      adminApi.updateDispute(id, { status: nextStatus, resolution })
    );
  };

  return (
    <>
      <PageHeader title={title} description={description} />

      <ErrorAlert>{error}</ErrorAlert>

      <Toolbar>
        {!fixedRole ? (
          <SelectField
            value={role}
            onValueChange={v => {
              setRole(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All roles' },
              { value: 'bidder', label: 'Buyers' },
              { value: 'seller', label: 'Sellers' },
              { value: 'admin', label: 'Admins' },
            ]}
          />
        ) : null}
        <SelectField
          value={active}
          onValueChange={v => {
            setActive(v);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'Active + inactive' },
            { value: 'true', label: 'Active only' },
            { value: 'false', label: 'Inactive only' },
          ]}
        />
        <SearchInput
          placeholder="Name, phone, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              setAppliedSearch(search);
              setPage(1);
            }
          }}
        />
        <SearchButton
          disabled={loading}
          onClick={() => {
            setAppliedSearch(search);
            setPage(1);
          }}
        />
      </Toolbar>

      <Panel>
        {loading ? (
          <Empty>Loading users…</Empty>
        ) : items.length === 0 ? (
          <Empty>No users found.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(u => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.full_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {u.phone_number}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {u.email || 'No email'}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge tone={u.is_verified ? 'ok' : 'warn'}>
                        {u.is_verified ? 'Verified' : 'Unverified'}
                      </Badge>
                      <Badge tone={u.is_active ? 'ok' : 'danger'}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <RiskFlags flags={u.risk_flags} compact />
                  </TableCell>
                  <TableCell>
                    <SelectField
                      value={u.role}
                      disabled={busyId === u.id}
                      onValueChange={v => update(u.id, { role: v })}
                      options={[
                        { value: 'bidder', label: 'bidder' },
                        { value: 'seller', label: 'seller' },
                        { value: 'admin', label: 'admin' },
                      ]}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-emerald-700">
                      {money(u.wallet_balance)}
                    </div>
                    {u.wallet_locked ? (
                      <Badge tone="danger">Locked</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Available
                      </span>
                    )}
                    {u.pending_penalty ? (
                      <div className="mt-1">
                        <Badge tone="warn">
                          Penalty {money(u.pending_penalty.amount)}
                        </Badge>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.counts?.gadgets ?? 0} gadgets
                    <br />
                    {u.counts?.auctions ?? 0} auctions
                    <br />
                    {u.counts?.purchases ?? 0} buys · {u.counts?.sales ?? 0}{' '}
                    sales
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {when(u.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      {u.role === 'seller' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={profileLoadingId === u.id}
                          onClick={() => openSellerProfile(u.id)}
                        >
                          <Eye />
                          {profileLoadingId === u.id ? 'Loading' : 'Profile'}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant={u.is_active ? 'destructive' : 'default'}
                        disabled={busyId === u.id}
                        onClick={() =>
                          update(u.id, { is_active: !u.is_active })
                        }
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      {!u.is_active && u.pending_penalty ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === u.id}
                          onClick={() => reactivateUser(u)}
                        >
                          Reactivate after penalty
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onChange={setPage}
          onLimitChange={value => {
            setLimit(value);
            setPage(1);
          }}
        />
      </Panel>

      <SellerProfileDialog
        profile={selectedSeller}
        busyId={profileActionId}
        onApproveGadget={approveSellerGadget}
        onRejectGadget={rejectSellerGadget}
        onCancelAuction={cancelSellerAuction}
        onSetVerified={setSellerVerified}
        onSetWalletLocked={setSellerWalletLocked}
        onUpdateDispute={updateSellerDispute}
        onOpenChange={open => {
          if (!open) setSelectedSeller(null);
        }}
      />
    </>
  );
}

export function BuyersPage() {
  return (
    <UsersPage
      fixedRole="bidder"
      title="Buyers"
      description="Buyer accounts, wallet balances, purchases, and account controls."
    />
  );
}

export function SellersPage() {
  return (
    <UsersPage
      fixedRole="seller"
      title="Sellers"
      description="Seller accounts, profile controls, listing activity, disputes, and wallet controls."
    />
  );
}

export function AdminsPage() {
  return (
    <UsersPage
      fixedRole="admin"
      title="Admins"
      description="Admin users and internal access controls."
    />
  );
}

function SellerProfileDialog({
  profile,
  busyId,
  onApproveGadget,
  onRejectGadget,
  onCancelAuction,
  onSetVerified,
  onSetWalletLocked,
  onUpdateDispute,
  onOpenChange,
}: {
  profile: AdminSellerProfile | null;
  busyId: string | null;
  onApproveGadget: (id: string) => void;
  onRejectGadget: (id: string) => void;
  onCancelAuction: (auction: {
    id: string;
    title: string;
    total_bids: number;
  }) => void;
  onSetVerified: (verified: boolean) => void;
  onSetWalletLocked: (locked: boolean) => void;
  onUpdateDispute: (id: string, nextStatus: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const stats = profile?.stats || {};

  return (
    <Dialog open={Boolean(profile)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        {profile ? (
          <>
            <DialogHeader>
              <DialogTitle>Seller profile</DialogTitle>
            </DialogHeader>

            <div className="rounded-xl border bg-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  {profile.user.avatar_url ? (
                    <img
                      className="size-16 rounded-2xl object-cover ring-1 ring-border"
                      src={mediaUrl(profile.user.avatar_url)}
                      alt={profile.user.full_name}
                    />
                  ) : (
                    <div className="grid size-16 place-items-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border">
                      <Store className="size-8" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {profile.user.full_name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {profile.user.phone_number} ·{' '}
                      {profile.user.email || 'No email'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={profile.user.is_verified ? 'ok' : 'warn'}>
                        {profile.user.is_verified ? 'Verified' : 'Unverified'}
                      </Badge>
                      <Badge tone={profile.user.is_active ? 'ok' : 'danger'}>
                        {profile.user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge
                        tone={profile.user.wallet.is_locked ? 'danger' : 'info'}
                      >
                        Wallet{' '}
                        {profile.user.wallet.is_locked ? 'locked' : 'open'}
                      </Badge>
                    </div>
                    <RiskFlags flags={profile.user.risk_flags} compact />
                  </div>
                </div>
                <div className="rounded-xl bg-muted/50 px-4 py-3 text-right">
                  <div className="text-sm text-muted-foreground">
                    Wallet balance
                  </div>
                  <div className="text-2xl font-semibold">
                    {money(profile.user.wallet.balance)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Joined {when(profile.user.created_at)}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                <Button
                  size="sm"
                  variant={profile.user.is_verified ? 'destructive' : 'default'}
                  disabled={busyId === profile.user.id}
                  onClick={() => onSetVerified(!profile.user.is_verified)}
                >
                  {profile.user.is_verified
                    ? 'Mark unverified'
                    : 'Verify seller'}
                </Button>
                <Button
                  size="sm"
                  variant={
                    profile.user.wallet.is_locked ? 'default' : 'destructive'
                  }
                  disabled={busyId === profile.user.id}
                  onClick={() =>
                    onSetWalletLocked(!profile.user.wallet.is_locked)
                  }
                >
                  {profile.user.wallet.is_locked
                    ? 'Unlock wallet'
                    : 'Lock wallet'}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <ProfileMetric
                icon={<PackageCheck />}
                label="Gadgets"
                value={stats.total_gadgets}
                detail={`${stats.pending_gadgets || 0} pending`}
              />
              <ProfileMetric
                icon={<Gavel />}
                label="Auctions"
                value={stats.total_auctions}
                detail={`${stats.active_auctions || 0} active`}
              />
              <ProfileMetric
                icon={<ShoppingBag />}
                label="Sales"
                value={stats.total_sales}
                detail={money(stats.gross_sales)}
              />
              <ProfileMetric
                icon={<Store />}
                label="Payouts"
                value={money(stats.seller_payouts)}
                detail={`${stats.approved_gadgets || 0} approved gadgets`}
              />
              <ProfileMetric
                icon={<AlertTriangle />}
                label="Disputes"
                value={stats.open_disputes}
                detail={`${stats.total_disputes || 0} total disputes`}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <ProfileList title="Latest gadgets">
                {profile.latest_gadgets.length ? (
                  profile.latest_gadgets.map(item => (
                    <ProfileListItem
                      key={item.id}
                      image={item.image}
                      title={item.title}
                      meta={`${item.category?.name || label(item.condition)} · ${label(item.status)}`}
                      badge={item.status || undefined}
                      actions={
                        item.status === 'pending' ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              size="xs"
                              disabled={busyId === item.id}
                              onClick={() => onApproveGadget(item.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="xs"
                              variant="destructive"
                              disabled={busyId === item.id}
                              onClick={() => onRejectGadget(item.id)}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : null
                      }
                    />
                  ))
                ) : (
                  <Empty>No gadgets yet.</Empty>
                )}
              </ProfileList>

              <ProfileList title="Latest auctions">
                {profile.latest_auctions.length ? (
                  profile.latest_auctions.map(item => (
                    <ProfileListItem
                      key={item.id}
                      image={item.image}
                      title={item.title}
                      meta={`${money(item.current_price)} · ${item.total_bids} bids`}
                      badge={item.status || undefined}
                      actions={
                        item.status === 'scheduled' ||
                        item.status === 'active' ? (
                          <Button
                            size="xs"
                            variant="destructive"
                            className="mt-2"
                            disabled={busyId === item.id}
                            onClick={() => onCancelAuction(item)}
                          >
                            {busyId === item.id
                              ? 'Cancelling'
                              : 'Cancel auction'}
                          </Button>
                        ) : null
                      }
                    />
                  ))
                ) : (
                  <Empty>No auctions yet.</Empty>
                )}
              </ProfileList>

              <ProfileList title="Latest sales">
                {profile.latest_sales.length ? (
                  profile.latest_sales.map(item => (
                    <ProfileListItem
                      key={item.id}
                      image={item.image}
                      title={item.title}
                      meta={`${money(item.seller_payout)} payout · ${item.buyer?.full_name || 'No buyer'}`}
                      badge={item.fulfillment_status || undefined}
                    />
                  ))
                ) : (
                  <Empty>No sales yet.</Empty>
                )}
              </ProfileList>

              <ProfileList title="Latest disputes">
                {profile.latest_disputes.length ? (
                  profile.latest_disputes.map(item => (
                    <ProfileListItem
                      key={item.id}
                      image={null}
                      fallbackIcon={<AlertTriangle className="size-5" />}
                      title={`${label(item.dispute_type)} · ${item.order?.order_number || 'No order'}`}
                      meta={`${item.raised_by?.full_name || 'Unknown'} · ${money(item.order?.total_amount)}`}
                      badge={item.status || undefined}
                      actions={
                        item.status === 'open' ||
                        item.status === 'investigating' ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {item.status === 'open' ? (
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={busyId === item.id}
                                onClick={() =>
                                  onUpdateDispute(item.id, 'investigating')
                                }
                              >
                                Investigate
                              </Button>
                            ) : null}
                            <Button
                              size="xs"
                              disabled={busyId === item.id}
                              onClick={() =>
                                onUpdateDispute(item.id, 'resolved')
                              }
                            >
                              Resolve
                            </Button>
                            <Button
                              size="xs"
                              variant="destructive"
                              disabled={busyId === item.id}
                              onClick={() =>
                                onUpdateDispute(item.id, 'rejected')
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        ) : null
                      }
                    />
                  ))
                ) : (
                  <Empty>No disputes yet.</Empty>
                )}
              </ProfileList>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProfileMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-muted-foreground">
        <span className="text-sm">{label}</span>
        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
      </div>
      <div className="text-2xl font-semibold">{value ?? 0}</div>
      <div className="text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

function ProfileList({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ProfileListItem({
  image,
  fallbackIcon,
  title,
  meta,
  badge,
  actions,
}: {
  image?: string | null;
  fallbackIcon?: React.ReactNode;
  title: string;
  meta: string;
  badge?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-xl border bg-background/70 p-2">
      {image ? (
        <img
          className="size-12 rounded-lg object-cover"
          src={mediaUrl(image)}
          alt={title}
        />
      ) : (
        <div className="grid size-12 place-items-center rounded-lg bg-muted text-muted-foreground">
          {fallbackIcon || <PackageCheck className="size-5" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{meta}</div>
        {badge ? (
          <Badge tone={statusTone(badge)} className="mt-1">
            {label(badge)}
          </Badge>
        ) : null}
        {actions}
      </div>
    </div>
  );
}
