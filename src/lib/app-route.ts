import { useCallback, useEffect, useState } from 'react';

export const MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { id: 'new-interview', label: 'New Interview', path: '/new-interview' },
  { id: 'interview-history', label: 'Interview History', path: '/interview-history' },
  { id: 'resumes', label: 'Resume Library', path: '/resumes' },
  { id: 'learning-progress', label: 'Learning Progress', path: '/learning-progress' },
  { id: 'settings', label: 'Settings', path: '/settings' },
] as const;

export type MenuId = (typeof MENU_ITEMS)[number]['id'];

export type AppRoute =
  | { kind: 'menu'; menu: MenuId }
  | { kind: 'history-session'; sessionId: string }
  | { kind: 'live-session'; sessionId: string; phase: 'active' | 'evaluation' };

const MENU_BY_PATH = new Map(MENU_ITEMS.map((item) => [item.path, item.id]));

function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function parseAppRoute(pathname: string): AppRoute {
  const path = stripTrailingSlash(pathname) || '/';
  const menu = MENU_BY_PATH.get(path as (typeof MENU_ITEMS)[number]['path']);
  if (menu) {
    return { kind: 'menu', menu };
  }

  const historyMatch = path.match(/^\/interview-history\/([^/]+)$/);
  if (historyMatch) {
    return { kind: 'history-session', sessionId: decodeURIComponent(historyMatch[1]) };
  }

  const evaluationMatch = path.match(/^\/interview\/([^/]+)\/evaluation$/);
  if (evaluationMatch) {
    return {
      kind: 'live-session',
      sessionId: decodeURIComponent(evaluationMatch[1]),
      phase: 'evaluation',
    };
  }

  const liveMatch = path.match(/^\/interview\/([^/]+)$/);
  if (liveMatch) {
    return {
      kind: 'live-session',
      sessionId: decodeURIComponent(liveMatch[1]),
      phase: 'active',
    };
  }

  return { kind: 'menu', menu: 'dashboard' };
}

export function pathForAppRoute(route: AppRoute): string {
  if (route.kind === 'menu') {
    const item = MENU_ITEMS.find((entry) => entry.id === route.menu);
    return item ? item.path : '/dashboard';
  }
  const sessionId = encodeURIComponent(route.sessionId);
  if (route.kind === 'history-session') {
    return `/interview-history/${sessionId}`;
  }
  if (route.phase === 'evaluation') {
    return `/interview/${sessionId}/evaluation`;
  }
  return `/interview/${sessionId}`;
}

export function menuForRoute(route: AppRoute): MenuId | null {
  if (route.kind === 'menu') return route.menu;
  if (route.kind === 'history-session') return 'interview-history';
  return null;
}

export function routeLabel(route: AppRoute): string {
  if (route.kind === 'menu') {
    return MENU_ITEMS.find((item) => item.id === route.menu)?.label ?? 'Dashboard';
  }
  if (route.kind === 'history-session') return 'Interview History';
  if (route.phase === 'evaluation') return 'Evaluation';
  return 'Interview';
}

export function sessionIdFromRoute(route: AppRoute): string | null {
  if (route.kind === 'menu') return null;
  return route.sessionId;
}

export function useAppRoute() {
  const [route, setRoute] = useState<AppRoute>(() => parseAppRoute(window.location.pathname));

  useEffect(() => {
    const sync = () => setRoute(parseAppRoute(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const navigate = useCallback((next: AppRoute, mode: 'push' | 'replace' = 'push') => {
    const path = pathForAppRoute(next);
    if (path !== window.location.pathname) {
      if (mode === 'replace') {
        window.history.replaceState(null, '', path);
      } else {
        window.history.pushState(null, '', path);
      }
    }
    setRoute(parseAppRoute(path));
  }, []);

  return { route, navigate };
}
