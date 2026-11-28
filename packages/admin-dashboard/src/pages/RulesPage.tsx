import { useEffect, useState } from 'react';
import { adminApi, type RuleRow } from '@/api';
import { SectionCard } from '@/components/attention';
import { Icon3d } from '@/components/shell/Icon3d';
import { ErrorAlert, PageHeader } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';

/** A rule can list bands (the platform fee is by sale price). */
type Row = RuleRow & { tiers?: string[] };

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl>
      {rows.map(r => (
        <div key={r.key} className="flex flex-col gap-1 border-b border-line px-6 py-3.5 last:border-0 sm:flex-row sm:items-center sm:gap-6">
          <dt className="text-[15px] text-slate sm:w-64">{r.label}</dt>
          <dd className="flex-1">
            <div className="text-[15px] font-medium text-ink">{r.value}</div>
            {r.tiers?.length ? (
              <ul className="my-1.5 grid gap-1">
                {r.tiers.map(t => (
                  <li key={t} className="text-[15px] tabular-nums text-ink">
                    {t}
                  </li>
                ))}
              </ul>
            ) : null}
            {r.note ? <div className="text-[13px] text-slate">{r.note}</div> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Read-only: the fees and rules the apps run on, straight from the backend's settings. */
export function RulesPage() {
  const [data, setData] = useState<{ fees: Row[]; rules: Row[]; review_targets: Row[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    adminApi
      .rules()
      .then(r => setData(r.data))
      .catch(err => setError(err.message || "Couldn't load the rules"));
  }, []);

  return (
    <div>
      <PageHeader
        title="Fees & rules"
        description="What buyers and sellers are charged and the deadlines the apps enforce. These come from the server settings; changing one needs a deploy."
        path="/rules"
      />
      <ErrorAlert>{error}</ErrorAlert>
      {data ? (
        <div className="grid gap-4">
          <SectionCard icon={<Icon3d name="tag" size={26} />} title="Fees">
            <Rows rows={data.fees} />
          </SectionCard>
          <SectionCard icon={<Icon3d name="gavel" size={26} />} title="Bidding and orders">
            <Rows rows={data.rules} />
          </SectionCard>
          <SectionCard icon={<Icon3d name="shield" size={26} />} title="Team review targets">
            <Rows rows={data.review_targets} />
          </SectionCard>
        </div>
      ) : !error ? (
        <Skeleton className="h-80 rounded-[24px]" />
      ) : null}
    </div>
  );
}
