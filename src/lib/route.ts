import { useCallback, useEffect, useState } from 'react';
import { NAV_ITEMS } from '@/lib/nav';

const VALID = new Set(NAV_ITEMS.map((n) => n.id));

/** '#/tasks' → 'tasks'. Anything unknown (including auth-token hashes) → 'home'. */
export function pageFromHash(hash: string): string {
  const id = hash.replace(/^#\/?/, '').split(/[/?&]/)[0];
  return VALID.has(id) ? id : 'home';
}

/**
 * Hash-based page routing. Navigation used to live in a bare useState, so
 * refreshing the browser or pressing Back always dumped you on Home, and no
 * page could be bookmarked. The URL hash keeps the app a static SPA (no
 * server rewrite rules needed) while making refresh, Back/Forward and deep
 * links work.
 */
export function usePageRoute(): [string, (id: string) => void] {
  const [page, setPage] = useState(() => pageFromHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setPage(pageFromHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((id: string) => {
    const next = VALID.has(id) ? id : 'home';
    if (pageFromHash(window.location.hash) === next && window.location.hash.startsWith('#/')) {
      setPage(next);
    } else {
      window.location.hash = `/${next}`; // pushes a history entry; hashchange updates state
    }
  }, []);

  return [page, navigate];
}
