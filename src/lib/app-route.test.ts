import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { menuForRoute, parseAppRoute, pathForAppRoute, type AppRoute } from './app-route.ts';

const routes: AppRoute[] = [
  { kind: 'menu', menu: 'dashboard' },
  { kind: 'menu', menu: 'new-interview' },
  { kind: 'menu', menu: 'interview-history' },
  { kind: 'menu', menu: 'resumes' },
  { kind: 'menu', menu: 'learning-progress' },
  { kind: 'menu', menu: 'settings' },
  { kind: 'history-session', sessionId: 'sess-abc' },
  { kind: 'live-session', sessionId: 'sess-abc', phase: 'active' },
  { kind: 'live-session', sessionId: 'sess-abc', phase: 'evaluation' },
];

describe('app routes', () => {
  it('round-trips every menu and session path', () => {
    const paths = routes.map((route) => pathForAppRoute(route));
    assert.deepEqual(paths, [
      '/dashboard',
      '/new-interview',
      '/interview-history',
      '/resumes',
      '/learning-progress',
      '/settings',
      '/interview-history/sess-abc',
      '/interview/sess-abc',
      '/interview/sess-abc/evaluation',
    ]);
    for (const route of routes) {
      assert.deepEqual(parseAppRoute(pathForAppRoute(route)), route);
    }
  });

  it('sends an unknown path to the dashboard', () => {
    assert.deepEqual(parseAppRoute('/'), { kind: 'menu', menu: 'dashboard' });
    assert.deepEqual(parseAppRoute('/missing'), { kind: 'menu', menu: 'dashboard' });
  });

  it('keeps interview history selected on a session path', () => {
    assert.equal(menuForRoute(parseAppRoute('/interview-history/sess-abc')), 'interview-history');
    assert.equal(menuForRoute(parseAppRoute('/interview/sess-abc')), null);
  });

  it('decodes a session id that contains reserved characters', () => {
    const route = parseAppRoute('/interview-history/sess%2F1');
    assert.deepEqual(route, { kind: 'history-session', sessionId: 'sess/1' });
    assert.equal(pathForAppRoute(route), '/interview-history/sess%2F1');
  });
});
