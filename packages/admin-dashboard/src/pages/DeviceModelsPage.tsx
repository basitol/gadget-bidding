import { useId, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { DEVICE_PROFILES, LISTING_CATEGORIES, profileByKey } from '@gadget-bidding/shared';
import { deviceModelsApi, type DeviceModel } from '@/api';
import { SectionCard } from '@/components/attention';
import { Chip, secondary } from '@/components/SellerApplicationPanel';
import { ErrorAlert, PageHeader, Pagination, SearchButton, SearchInput } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePagedResource } from '@/hooks/usePagedResource';
import { friendlyTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const FILTERS = [
  { key: 'active', label: 'In the search' },
  { key: 'inactive', label: 'Hidden' },
  { key: 'all', label: 'All' },
] as const;
type Filter = (typeof FILTERS)[number]['key'];

const field = 'h-11 rounded-[12px] bg-white text-[14px]';

/** The device kinds, grouped by the category sellers pick first. */
function ProfileSelect({ id, value, onChange, invalid }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid} className={cn(field, 'w-full')}>
        <SelectValue placeholder="Pick a kind" />
      </SelectTrigger>
      <SelectContent position="popper" className="z-[100] max-h-80 bg-white">
        {LISTING_CATEGORIES.map(c => {
          const kinds = DEVICE_PROFILES.filter(p => p.category === c.key);
          if (!kinds.length) return null;
          return (
            <SelectGroup key={c.key}>
              <SelectLabel>{c.label}</SelectLabel>
              {kinds.map(p => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function AddModel({ onAdded }: { onAdded: () => void }) {
  const ids = useId();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [profile, setProfile] = useState('');
  const [aliases, setAliases] = useState('');
  const [errors, setErrors] = useState<{ name?: string; brand?: string; profile?: string }>({});
  const [busy, setBusy] = useState(false);

  const checkName = (v: string) => (v.trim().length < 2 ? 'Add the model name, e.g. iPhone 17 Pro.' : undefined);
  const checkBrand = (v: string) => (v.trim().length < 2 ? 'Add the brand, e.g. Apple.' : undefined);

  const pickProfile = (v: string) => {
    setProfile(v);
    setErrors(e => ({ ...e, profile: undefined }));
    const p = profileByKey(v);
    if (p?.brand && !brand.trim()) setBrand(p.brand);
  };

  const submit = async () => {
    const next = { name: checkName(name), brand: checkBrand(brand), profile: profile ? undefined : 'Pick what kind of device it is.' };
    setErrors(next);
    if (next.name || next.brand || next.profile) return;
    setBusy(true);
    try {
      const res = await deviceModelsApi.add({
        name: name.trim(),
        brand: brand.trim(),
        profile,
        aliases: aliases
          .split(',')
          .map(a => a.trim())
          .filter(Boolean),
      });
      toast.success(res.message || `${res.data.name} added`);
      setName('');
      setAliases('');
      setBrand('');
      setProfile('');
      onAdded();
    } catch (err: any) {
      toast.error(err.message || 'Couldn’t add that model. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const kind = profileByKey(profile);

  return (
    <SectionCard icon={<Smartphone className="size-[18px] text-blue-press" />} title="Add a model" className="mb-8">
      <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ids}-name`} className="text-[14px] text-ink">
            Model name
          </Label>
          <Input
            id={`${ids}-name`}
            value={name}
            maxLength={120}
            aria-invalid={!!errors.name}
            aria-describedby={`${ids}-name-hint`}
            onChange={e => {
              setName(e.target.value);
              if (errors.name && !checkName(e.target.value)) setErrors(x => ({ ...x, name: undefined }));
            }}
            onBlur={() => name && setErrors(x => ({ ...x, name: checkName(name) }))}
            className={field}
          />
          <p id={`${ids}-name-hint`} className={cn('text-[13px]', errors.name ? 'text-[#D9536A]' : 'text-slate')}>
            {errors.name || 'As sellers would search for it, e.g. iPhone 17 Pro.'}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ids}-kind`} className="text-[14px] text-ink">
            Kind of device
          </Label>
          <ProfileSelect id={`${ids}-kind`} value={profile} onChange={pickProfile} invalid={!!errors.profile} />
          <p className={cn('text-[13px]', errors.profile ? 'text-[#D9536A]' : 'text-slate')}>
            {errors.profile ||
              (kind
                ? `Sellers answer the ${kind.label} questions and take its ${kind.photos.filter(p => p.required).length} required photos.`
                : 'Decides the questions and photos sellers get.')}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ids}-brand`} className="text-[14px] text-ink">
            Brand
          </Label>
          <Input
            id={`${ids}-brand`}
            value={brand}
            maxLength={60}
            aria-invalid={!!errors.brand}
            aria-describedby={`${ids}-brand-hint`}
            onChange={e => {
              setBrand(e.target.value);
              if (errors.brand && !checkBrand(e.target.value)) setErrors(x => ({ ...x, brand: undefined }));
            }}
            onBlur={() => brand && setErrors(x => ({ ...x, brand: checkBrand(brand) }))}
            className={field}
          />
          {errors.brand ? (
            <p id={`${ids}-brand-hint`} className="text-[13px] text-[#D9536A]">
              {errors.brand}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ids}-aliases`} className="text-[14px] text-ink">
            Other names (optional)
          </Label>
          <Input
            id={`${ids}-aliases`}
            value={aliases}
            aria-describedby={`${ids}-aliases-hint`}
            onChange={e => setAliases(e.target.value)}
            className={field}
          />
          <p id={`${ids}-aliases-hint`} className="text-[13px] text-slate">
            Separate with commas, e.g. 17 pro, iphone 17pro.
          </p>
        </div>
        <div className="md:col-span-2">
          <Button
            className="h-10 rounded-[10px] px-4 text-[14px] focus-visible:outline-2 focus-visible:outline-blue-brand"
            disabled={busy}
            onClick={submit}
          >
            {busy ? 'Adding…' : 'Add to the search'}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

/** Models the seller app's "List a gadget" search offers. New phones and laptops go in here within a day of launch. */
export function DeviceModelsPage() {
  const [filter, setFilter] = useState<Filter>('active');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const paged = usePagedResource<DeviceModel>(
    ({ page, limit }) =>
      deviceModelsApi.list({ status: filter, category: category === 'all' ? undefined : category, search: applied, page, limit }),
    [filter, category, applied]
  );

  const toggle = async (m: DeviceModel) => {
    setBusyId(m.id);
    try {
      const res = await deviceModelsApi.update(m.id, { is_active: !m.is_active });
      toast.success(res.message || 'Saved');
      paged.reload();
    } catch (err: any) {
      toast.error(err.message || 'Couldn’t save that. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const runSearch = () => {
    setApplied(search.trim());
    paged.resetPage();
  };

  return (
    <div className="pb-16">
      <PageHeader
        title="Device models"
        description="The models sellers can pick when they list a gadget. Add new ones as they come out; hiding one keeps old listings as they are."
        path="/device-models"
      />
      <ErrorAlert>{paged.error}</ErrorAlert>

      <AddModel
        onAdded={() => {
          setFilter('active');
          paged.reload();
        }}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Show models" className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => {
                setFilter(f.key);
                paged.resetPage();
              }}
              className={cn(
                'h-9 rounded-full px-4 text-[14px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-brand',
                filter === f.key ? 'bg-ink text-white' : 'bg-white text-slate ring-1 ring-line hover:text-ink'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Select
          value={category}
          onValueChange={v => {
            setCategory(v);
            paged.resetPage();
          }}
        >
          <SelectTrigger aria-label="Category" className={cn(field, 'w-[190px]')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="z-[100] bg-white">
            <SelectItem value="all">All categories</SelectItem>
            {LISTING_CATEGORIES.map(c => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchInput
          placeholder="Search name, brand or other name…"
          aria-label="Search models"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runSearch()}
        />
        <SearchButton disabled={paged.loading} onClick={runSearch} />
      </div>

      <SectionCard
        icon={<Smartphone className="size-[18px] text-slate" />}
        title="Models"
        meta={paged.loading ? undefined : `${paged.total.toLocaleString('en-NG')}`}
      >
        {paged.loading && !paged.items.length ? (
          <Skeleton className="m-6 h-40" />
        ) : paged.items.length === 0 ? (
          <p className="px-6 py-8 text-[15px] text-slate">
            {applied ? `Nothing matches “${applied}”. Add it above if it’s missing.` : 'No models here.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Model</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Other names</TableHead>
                <TableHead className="text-right">Listings</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.items.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="pl-6">
                    <div className="text-[14px] font-medium text-ink">{m.name}</div>
                    <div className="text-[13px] text-slate">
                      {m.brand}
                      {m.added_by ? ` · added by ${m.added_by.full_name ?? 'the team'} ${friendlyTime(m.created_at)}` : ''}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-[14px] text-ink">{m.profile_label ?? m.profile}</div>
                    <div className="text-[13px] text-slate">{m.category_label ?? m.category}</div>
                  </TableCell>
                  <TableCell className="max-w-[240px] whitespace-normal text-[13px] text-slate">
                    {m.aliases.length ? m.aliases.join(', ') : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[14px] text-ink">{m.listings}</TableCell>
                  <TableCell>
                    <Chip tone={m.is_active ? 'ok' : 'neutral'}>{m.is_active ? 'In the search' : 'Hidden'}</Chip>
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <Button variant="outline" className={secondary} disabled={busyId === m.id} onClick={() => toggle(m)}>
                      {busyId === m.id ? 'Saving…' : m.is_active ? 'Hide from search' : 'Show in search'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination
          page={paged.page}
          totalPages={paged.totalPages}
          total={paged.total}
          limit={paged.limit}
          onChange={paged.setPage}
          onLimitChange={paged.setLimit}
        />
      </SectionCard>
    </div>
  );
}
