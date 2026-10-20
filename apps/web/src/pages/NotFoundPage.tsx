import { Link } from 'react-router-dom';
import { Flame, TrendingUp } from 'lucide-react';
import { LogoMark } from '@/components/layout/Logo';
import { usePageTitle } from '@/components/layout/Page';
import { useActiveChain } from '@/hooks/useActiveChain';
import { routes } from '@/lib/chain';

/** 404 for unknown routes. */
export default function NotFoundPage() {
  const chain = useActiveChain();
  usePageTitle('Page not found');
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark size={48} />
      <div>
        <p className="num text-sm font-semibold text-accent">404</p>
        <h1 className="mt-1 text-lg font-semibold">Lost in the trenches</h1>
        <p className="mt-1 max-w-sm text-sm text-muted">This page doesn’t exist, or the link is out of date. Pick a feed and keep scanning.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link to={routes.trenches(chain)} className="btn-primary">
          <Flame size={14} /> Trenches
        </Link>
        <Link to={routes.trending(chain)} className="btn-outline">
          <TrendingUp size={14} /> Trending
        </Link>
      </div>
    </div>
  );
}
