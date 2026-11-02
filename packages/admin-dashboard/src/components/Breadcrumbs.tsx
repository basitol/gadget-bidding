import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { BreadcrumbJsonLd } from '@/components/Seo';
import { cn } from '@/lib/utils';

export type Crumb = {
  label: string;
  to?: string;
};

export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  const withHome: Crumb[] =
    items[0]?.to === '/' || items[0]?.label === 'Overview'
      ? items
      : [{ label: 'Overview', to: '/' }, ...items];

  const jsonLdItems = withHome.map((item, index) => ({
    name: item.label,
    path:
      item.to ||
      (index === withHome.length - 1 ? window.location.pathname : '/'),
  }));

  return (
    <nav aria-label="Breadcrumb" className={cn('mb-4', className)}>
      <BreadcrumbJsonLd items={jsonLdItems} />
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {withHome.map((item, index) => {
          const last = index === withHome.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              {index > 0 ? (
                <li aria-hidden className="text-muted-foreground/50">
                  <ChevronRight className="size-3.5" />
                </li>
              ) : null}
              <li>
                {last || !item.to ? (
                  <span
                    aria-current={last ? 'page' : undefined}
                    className={cn(last && 'font-medium text-foreground')}
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.to}
                    className="transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
