import { Link } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Seo } from '@/components/Seo';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-6 py-16">
      <Seo
        title="Page not found"
        description="This page does not exist in GadgetBid Ops."
        path="/404"
        noindex
      />
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <BrandMark size="lg" />
        </div>
        <Breadcrumbs
          className="mb-6 flex justify-center"
          items={[{ label: 'Not found' }]}
        />
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Error 404
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          That URL is not part of GadgetBid Ops. Check the address or return to
          overview.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to="/">Back to overview</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
        <nav
          aria-label="Helpful links"
          className="mt-10 border-t pt-6 text-sm text-muted-foreground"
        >
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            <li>
              <Link className="hover:text-foreground" to="/gadgets">
                Gadgets
              </Link>
            </li>
            <li>
              <Link className="hover:text-foreground" to="/auctions">
                Auctions
              </Link>
            </li>
            <li>
              <Link className="hover:text-foreground" to="/orders">
                Orders
              </Link>
            </li>
            <li>
              <Link className="hover:text-foreground" to="/support">
                Support
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
