import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Search, SearchX } from 'lucide-react';
import { adminApi, type AdminSearchResult } from '@/api';
import { Seo } from '@/components/Seo';
import { Button } from '@/components/ui/button';
import { usePageStatus } from '@/components/states';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = { bidder: 'Buyer', seller: 'Seller', admin: 'Team', staff: 'Store staff' };

/** "fulfillment_status" values read as words: "sent_to_backoffice" → "Sent to backoffice". */
const words = (v: string | null) => (v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ') : '');

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="px-1 pb-1 text-[13px] font-medium uppercase tracking-[0.04em] text-slate">{title}</h3>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

function ResultLink({ to, title, sub }: { to: string; title: string; sub: string }) {
  return (
    <li>
      <Link
        to={to}
        className="flex flex-col rounded-[10px] px-3 py-2 text-left transition-colors duration-150 hover:bg-fill focus-visible:outline-2 focus-visible:outline-blue-brand"
      >
        <span className="truncate text-[14px] font-medium text-ink">{title}</span>
        <span className="truncate text-[13px] text-slate">{sub}</span>
      </Link>
    </li>
  );
}

/**
 * The page doesn't exist. Inside the dashboard it offers a search for whatever the link pointed at
 * (an order, a person, a seller ID or a listing); signed out, it points to sign-in.
 */
export function NotFoundPage({ signedOut = false }: { signedOut?: boolean }) {
  usePageStatus('Not found');
  const id = useId();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AdminSearchResult | null>(null);
  const [error, setError] = useState('');

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2) {
      setError('Type at least 2 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setResult((await adminApi.search(term)).data);
    } catch (err: any) {
      setError(err.message || 'Search didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const found = result ? result.orders.length + result.users.length + result.listings.length : 0;

  const card = (
    <section className="gb-elev flex flex-col items-center rounded-[24px] border border-white/80 bg-white/90 px-6 pb-10 pt-12 text-center">
      <span className="grid size-14 place-items-center rounded-[16px] bg-blue-tint text-blue-brand">
        <SearchX className="size-7" aria-hidden />
      </span>
      <p className="mt-4 text-[13px] font-medium tabular-nums text-slate">404</p>
      <h1 className="mt-1 text-[26px] font-medium tracking-[-0.02em] text-ink">This page doesn’t exist</h1>
      <p className="mt-2 max-w-[440px] text-[15px] leading-[1.5] text-slate">
        {signedOut
          ? 'The link may be old or typed wrong. Sign in to find what you were looking for.'
          : 'The link may be old, or the order, user or listing was removed. Try searching for it instead.'}
      </p>

      {signedOut ? (
        <Button asChild className="mt-6 h-10 rounded-[10px] px-4 text-[14px]">
          <Link to="/login">Go to sign in</Link>
        </Button>
      ) : (
        <>
          <form onSubmit={search} role="search" className="mt-6 w-full max-w-[440px]">
            <label htmlFor={id} className="sr-only">
              Search for an order, email, seller ID or item
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-hint" aria-hidden />
              <input
                id={id}
                type="search"
                value={q}
                maxLength={100}
                onChange={e => {
                  setQ(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Order ID, email, seller ID or item"
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-error` : undefined}
                className={cn(
                  'h-10 w-full rounded-[12px] border border-line bg-fill pl-9 pr-3 text-[14px] text-ink outline-none transition-colors duration-150 placeholder:text-faint focus:border-blue-brand focus:bg-white focus:outline-1 focus:outline-blue-brand',
                  error && 'border-[#D9536A]'
                )}
              />
            </div>
            {error ? (
              <p id={`${id}-error`} role="alert" className="mt-1.5 text-left text-[13px] text-[#D9536A]">
                {error}
              </p>
            ) : null}
          </form>

          {busy ? (
            <p className="mt-4 text-[14px] text-slate" aria-live="polite">
              Searching…
            </p>
          ) : result ? (
            <div className="mt-4 w-full max-w-[440px] text-left" aria-live="polite">
              {found === 0 ? (
                <p className="text-center text-[14px] text-slate">Nothing matches “{result.query}”.</p>
              ) : (
                <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-white p-2">
                  {result.orders.length ? (
                    <ResultGroup title="Orders">
                      {result.orders.map(o => (
                        <ResultLink
                          key={o.id}
                          to={o.path}
                          title={o.order_number}
                          sub={[o.title, words(o.status)].filter(Boolean).join(' · ')}
                        />
                      ))}
                    </ResultGroup>
                  ) : null}
                  {result.users.length ? (
                    <ResultGroup title="People">
                      {result.users.map(u => (
                        <ResultLink
                          key={u.id}
                          to={u.path}
                          title={u.name}
                          sub={[ROLE_LABEL[u.role] ?? u.role, u.seller_code, u.email].filter(Boolean).join(' · ')}
                        />
                      ))}
                    </ResultGroup>
                  ) : null}
                  {result.listings.length ? (
                    <ResultGroup title="Listings">
                      {result.listings.map(g => (
                        <ResultLink key={g.id} to={g.path} title={g.title} sub={words(g.status)} />
                      ))}
                    </ResultGroup>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button asChild className="h-10 rounded-[10px] px-4 text-[14px] focus-visible:outline-2 focus-visible:outline-blue-brand">
              <Link to="/">Go to Overview</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-10 rounded-[10px] border-line bg-white px-4 text-[14px] text-ink hover:bg-fill focus-visible:outline-2 focus-visible:outline-blue-brand"
            >
              <Link to="/buyers">Find a user</Link>
            </Button>
          </div>
        </>
      )}
    </section>
  );

  return (
    <>
      <Seo title="Page not found" description="This page does not exist in Gadgets Bidding Ops." path="/404" noindex />
      {signedOut ? (
        <div className="gb-canvas flex min-h-svh items-center justify-center p-6">
          <div className="w-full max-w-[560px]">{card}</div>
        </div>
      ) : (
        <div className="pb-16 pt-1">{card}</div>
      )}
    </>
  );
}
