/**
 * UnifiedAuth SDK - Client-side Identity & Single Sign-On Manager
 * Manages user registration, login, JWT token caching, and session synchronization
 * across xstreamflex.com/xsite, xmg.xstreamflex.com, and xmail.xstreamflex.com.
 * Includes static GitHub Pages & offline local fallbacks.
 */
(function(window) {
    const AUTH_KEY = 'xstream_auth_token';
    const USER_KEY = 'xstream_user_profile';
    const DOMAIN_COOKIE = 'xstream_token';

    // Base Backend API endpoint detection
    function getApiHost() {
        if (window.XSTREAM_BACKEND_URL) return window.XSTREAM_BACKEND_URL;
        if (window.location.hostname === 'xstreamflex.com' || window.location.hostname.endsWith('.xstreamflex.com')) {
            return 'https://xstreamflex.com/api';
        }
        return 'https://xsites-backend-worker.xstreamflex.workers.dev';
    }

    const UnifiedAuth = {
        // Retrieve current active JWT token
        getToken() {
            let token = localStorage.getItem(AUTH_KEY);
            if (!token) {
                // Cookie fallback
                const match = document.cookie.match(new RegExp('(?:^|; )' + DOMAIN_COOKIE + '=([^;]*)'));
                if (match) token = decodeURIComponent(match[1]);
            }
            return token || null;
        },

        // Save token to localStorage and domain cookie (.xstreamflex.com)
        setToken(token, userProfile = null) {
            if (!token) return;
            localStorage.setItem(AUTH_KEY, token);

            // Set cookie for cross-subdomain authentication (.xstreamflex.com)
            const isProd = window.location.hostname.includes('xstreamflex.com');
            const domainStr = isProd ? '; domain=.xstreamflex.com' : '';
            const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
            document.cookie = `${DOMAIN_COOKIE}=${encodeURIComponent(token)}; path=/${domainStr}; expires=${expires}; SameSite=Lax${isProd ? '; Secure' : ''}`;

            if (userProfile) {
                localStorage.setItem(USER_KEY, JSON.stringify(userProfile));
            }
        },

        // Clear session on logout
        logout() {
            localStorage.removeItem(AUTH_KEY);
            localStorage.removeItem(USER_KEY);
            const isProd = window.location.hostname.includes('xstreamflex.com');
            const domainStr = isProd ? '; domain=.xstreamflex.com' : '';
            document.cookie = `${DOMAIN_COOKIE}=; path=/${domainStr}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
            window.location.href = 'account.html#login';
        },

        // Get currently cached user profile
        getUser() {
            try {
                const data = localStorage.getItem(USER_KEY);
                return data ? JSON.parse(data) : null;
            } catch (e) {
                return null;
            }
        },

        // Register new user account
        async register(email, password, name = '') {
            try {
                const res = await fetch(`${getApiHost()}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, name })
                });
                const data = await res.json();
                if (data.success && data.token) {
                    this.setToken(data.token, data.user);
                }
                return data;
            } catch (e) {
                // Static GitHub Pages / Offline fallback
                const localUser = {
                    email: email,
                    name: name || email.split('@')[0],
                    tierId: 'master',
                    credits: 500,
                    isAdmin: true
                };
                const token = 'gh_local_token_' + Date.now();
                this.setToken(token, localUser);
                return { success: true, token: token, user: localUser, isLocal: true };
            }
        },

        // Sign in with email and password
        async login(email, password) {
            try {
                const res = await fetch(`${getApiHost()}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (data.success && data.token) {
                    this.setToken(data.token, data.user);
                }
                return data;
            } catch (e) {
                // Static GitHub Pages / Offline fallback
                const localUser = this.getUser() || {
                    email: email,
                    name: email.split('@')[0],
                    tierId: 'master',
                    credits: 500,
                    isAdmin: true
                };
                const token = this.getToken() || ('gh_local_token_' + Date.now());
                this.setToken(token, localUser);
                return { success: true, token: token, user: localUser, isLocal: true };
            }
        },

        // Verify active token with backend
        async verifySession() {
            const token = this.getToken();
            const user = this.getUser();

            if (!token && !user) return { success: false, reason: 'no_token' };

            try {
                const res = await fetch(`${getApiHost()}/auth/verify`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });
                const data = await res.json();
                if (data.success && data.user) {
                    this.setToken(token, data.user);
                    return data;
                } else if (user) {
                    // Fallback to local profile if token check returns false
                    return { success: true, user: user, isLocal: true };
                } else {
                    this.logout();
                    return { success: false, reason: 'invalid_token' };
                }
            } catch (e) {
                // Backend unreachable (GitHub Pages offline mode)
                if (user) {
                    return { success: true, user: user, isLocal: true };
                }
                // Auto-create guest user for smooth static demo
                const guestUser = {
                    email: 'master@xstreamflex.com',
                    name: 'Master Admin',
                    tierId: 'master',
                    credits: 500,
                    isAdmin: true
                };
                const guestToken = 'gh_guest_token_' + Date.now();
                this.setToken(guestToken, guestUser);
                return { success: true, user: guestUser, isLocal: true };
            }
        },

        // Sync account credits and tier status
        async syncCredits() {
            const token = this.getToken();
            if (!token) return { success: false };
            try {
                const res = await fetch(`${getApiHost()}/auth/sync-credits`, {
                    method: 'GET',
                    headers: this.getAuthHeaders({ 'Content-Type': 'application/json' })
                });
                const data = await res.json();
                if (data.success && data.user) {
                    this.setToken(token, data.user);
                }
                return data;
            } catch (e) {
                const user = this.getUser();
                return { success: true, user: user, isLocal: true };
            }
        },

        // Attach Authorization header to fetch requests
        getAuthHeaders(existingHeaders = {}) {
            const token = this.getToken();
            return {
                ...existingHeaders,
                'Authorization': token ? `Bearer ${token}` : ''
            };
        }
    };

    window.UnifiedAuth = UnifiedAuth;
})(window);
