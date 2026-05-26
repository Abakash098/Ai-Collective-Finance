import { useAuth } from '@clerk/clerk-react';
import { useDispatch } from 'react-redux';
import { useCallback } from 'react';
import { updateToken } from '../store/authSlice';

/**
 * useApi - a hook that returns a fetch function that automatically:
 * 1. Gets a fresh Clerk token before every call (no expired token errors)
 * 2. Injects the Authorization header
 * 3. Updates the token in Redux if it changed
 */
export function useApi() {
  const { getToken } = useAuth();
  const dispatch = useDispatch();

  const apiFetch = useCallback(async (url, options = {}) => {
    // Leverage Clerk's cache (refreshes automatically if close to expiry)
    // Removed skipCache: true to prevent unnecessary network requests to Clerk on every call
    const token = await getToken();
    
    // Update the token in Redux if changed
    if (token) {
      dispatch(updateToken(token));
    }

    const headers = { ...(options.headers || {}) };
    
    // Only set Authorization if we have a token
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Don't set Content-Type for FormData - browser handles multipart boundary
    const isFormData = options.body instanceof FormData;
    if (!isFormData && options.body && typeof options.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    return fetch(url, { ...options, headers });
  }, [getToken, dispatch]);

  return { apiFetch };
}
