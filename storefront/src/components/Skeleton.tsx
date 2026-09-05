export function Skeleton({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`skeleton ${className}`.trim()} style={style} aria-hidden />;
}

export function ProductCardSkeleton({ list = false }: { list?: boolean }) {
  return (
    <div className={`product-card skeleton-card${list ? ' is-list' : ''}`}>
      <Skeleton className="skeleton-thumb" />
      <div className="body" style={{ gap: 10 }}>
        <Skeleton style={{ height: 14, width: '80%' }} />
        <Skeleton style={{ height: 12, width: '40%' }} />
        <Skeleton style={{ height: 18, width: '50%' }} />
        <Skeleton style={{ height: 38, width: '100%', borderRadius: 8 }} />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8, list = false }: { count?: number; list?: boolean }) {
  return (
    <div className={list ? 'list-products' : 'grid-products'}>
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} list={list} />
      ))}
    </div>
  );
}
