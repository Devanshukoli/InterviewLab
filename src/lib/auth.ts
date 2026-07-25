// Client Authentication & Token Management Utilities
import { ApiResponse } from '../shared/types';

let refreshPromise: Promise<string | null> | null = null;

/**
 * Checks if a JWT access token is missing, expired, or expiring within thresholdSeconds (default 2 minutes)
 */
export function isTokenExpiringSoon(token: string | null, thresholdSeconds = 120): boolean {
  if (!token) return true;
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return true;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    if (!payload.exp) return false;
    const nowInSeconds = Math.floor(Date.now() / 1000);
    return payload.exp - nowInSeconds <= thresholdSeconds;
  } catch (err) {
    return true;
  }
}

/**
 * Requests a new access token using the stored refresh token with rotation support and request deduplication
 */
export async function refreshAccessToken(): Promise<string | null> {
  // Deduplicate concurrent refresh requests
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      clearAuthTokens();
      return null;
    }

    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      const json = await res.json();

      if (res.ok && json.success && json.data?.token) {
        const newAccessToken = json.data.token as string;
        const newRefreshToken = json.data.refreshToken as string;

        localStorage.setItem('auth_token', newAccessToken);
        if (newRefreshToken) {
          localStorage.setItem('refresh_token', newRefreshToken);
        }
        if (json.data.user) {
          localStorage.setItem('user_profile', JSON.stringify(json.data.user));
        }

        // Notify other components/tabs of updated auth token
        window.dispatchEvent(new CustomEvent('auth_token_refreshed', { detail: newAccessToken }));

        return newAccessToken;
      } else {
        clearAuthTokens();
        return null;
      }
    } catch (err) {
      console.warn('🔮 [TokenRefresh] Failed to refresh access token:', err);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Helper to get an access token, automatically refreshing it prior to expiration
 */
export async function getValidAuthToken(): Promise<string | null> {
  const currentToken = localStorage.getItem('auth_token');

  if (!currentToken || isTokenExpiringSoon(currentToken)) {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      return await refreshAccessToken();
    }
    return null;
  }

  return currentToken;
}

/**
 * Clears stored authentication state
 */
export function clearAuthTokens(): void {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user_profile');
}

/**
 * Performs server-side logout and token revocation, then clears local storage tokens
 */
export async function logoutUser(): Promise<void> {
  const accessToken = localStorage.getItem('auth_token');
  const refreshToken = localStorage.getItem('refresh_token');

  try {
    if (accessToken || refreshToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({ refreshToken })
      });
    }
  } catch (err) {
    console.warn('🔮 [Logout] Server logout error:', err);
  } finally {
    clearAuthTokens();
    window.dispatchEvent(new CustomEvent('auth_logout'));
  }
}

/**
 * Wrapper for fetch API that ensures token is valid before sending request and retries once on 401
 */
export async function fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let token = await getValidAuthToken();

  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response = await fetch(input, { ...init, headers });

  // If response is 401 Unauthorized, attempt refresh once and retry
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(input, { ...init, headers });
    }
  }

  return response;
}

/**
 * Enhanced fetch wrapper that automatically parses and returns a typed ApiResponse<T>.
 */
export async function fetchJsonWithAuth<T = any>(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetchWithAuth(input, init);
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP error ${response.status}: ${response.statusText}`,
        };
      }
      return {
        success: true,
      } as ApiResponse<T>;
    }

    const data = await response.json();
    return data as ApiResponse<T>;
  } catch (error) {
    console.error('🔮 [fetchJsonWithAuth] Fetch failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred during the request',
    };
  }
}

