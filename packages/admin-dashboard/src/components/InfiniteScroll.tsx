import { ReactNode, useEffect, useRef } from 'react';

export function InfiniteScroll({
  hasMore,
  loading,
  loadingMore,
  onLoadMore,
  children,
  className,
}: {
  hasMore: boolean;
  loading?: boolean;
  loadingMore?: boolean;
  onLoadMore: () => void;
  children: ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const rootEl = rootRef.current;
    const node = sentinelRef.current;
    if (!node) return;

    const root =
      rootEl && rootEl.scrollHeight > rootEl.clientHeight + 4 ? rootEl : null;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          onLoadMore();
        }
      },
      { root, rootMargin: '160px 0px', threshold: 0 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loadingMore, children]);

  return (
    <div ref={rootRef} className={className}>
      {children}
      <div
        ref={sentinelRef}
        className="py-3 text-center text-xs text-muted-foreground"
      >
        {loadingMore ? (
          <span>Loading more…</span>
        ) : hasMore ? (
          <span>Scroll for more</span>
        ) : loading ? null : (
          <span>End of list</span>
        )}
      </div>
    </div>
  );
}
