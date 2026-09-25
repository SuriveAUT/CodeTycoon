const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};
const configuredBase = env.VITE_API_BASE_URL;
export const API_BASE_URL = (configuredBase || (env.PROD ? "/api" : "http://localhost:3005/api")).replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = Number(env.VITE_API_TIMEOUT_MS || 10000);
const RETRY_DELAY_MS = 400;

export const AstraforgeAPI = {
    // Current logged-in user state
    token: localStorage.getItem('astraforge_token'),
    username: localStorage.getItem('astraforge_username'),
    flagged: localStorage.getItem('astraforge_flagged') === '1',
    flagReason: localStorage.getItem('astraforge_flag_reason') || '',

    _setAccountStatus(account) {
        if (!account || typeof account !== 'object') return;
        if (account.username) {
            this.username = account.username;
            localStorage.setItem('astraforge_username', account.username);
        }
        this.flagged = Boolean(account.flagged);
        this.flagReason = account.flagReason || account.flag_reason || '';
        localStorage.setItem('astraforge_flagged', this.flagged ? '1' : '0');
        if (this.flagReason) {
            localStorage.setItem('astraforge_flag_reason', this.flagReason);
        } else {
            localStorage.removeItem('astraforge_flag_reason');
        }
    },

    async _fetchWithTimeout(url, config, timeoutMs) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...config, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
    },

    // Helper to make authenticated requests
    async _request(endpoint, method = 'GET', body = null) {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const config = { method, headers };
        if (body) {
            config.body = JSON.stringify(body);
        }

        try {
            const url = `${API_BASE_URL}${endpoint}`;
            let response;
            try {
                response = await this._fetchWithTimeout(url, config, REQUEST_TIMEOUT_MS);
            } catch (firstErr) {
                const canRetry = method === 'GET' && (firstErr?.name === 'AbortError' || firstErr instanceof TypeError);
                if (!canRetry) throw firstErr;
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
                response = await this._fetchWithTimeout(url, config, REQUEST_TIMEOUT_MS);
            }
            
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                const text = await response.text();
                data = { error: text || 'Server returned non-JSON response' };
            }

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    // Keep local session in sync with backend auth state.
                    this.logout();
                }
                throw new Error(data.error || 'API Request failed');
            }
            return data;
        } catch (err) {
            console.error('API Error:', err);
            throw err;
        }
    },

    // User Registration
    async register(username, password) {
        return this._request('/auth/register', 'POST', { username, password });
    },

    // User Login
    async login(username, password) {
        const data = await this._request('/auth/login', 'POST', { username, password });
        // Save session
        this.token = data.token;
        this.username = data.username;
        localStorage.setItem('astraforge_token', data.token);
        localStorage.setItem('astraforge_username', data.username);
        this._setAccountStatus(data.account);
        return data;
    },

    // User Logout
    logout() {
        this.token = null;
        this.username = null;
        this.flagged = false;
        this.flagReason = '';
        localStorage.removeItem('astraforge_token');
        localStorage.removeItem('astraforge_username');
        localStorage.removeItem('astraforge_flagged');
        localStorage.removeItem('astraforge_flag_reason');
    },

    // Check if user is logged in
    isLoggedIn() {
        return !!this.token;
    },

    // Save game state
    async saveGame(gameStateObject) {
        const data = await this._request('/game/save', 'POST', { gameData: gameStateObject });
        this._setAccountStatus(data.account);
        return data;
    },

    // Load game state
    async loadGame() {
        const data = await this._request('/game/load', 'GET');
        this._setAccountStatus(data.account);
        return data;
    },

    async getAccountStatus() {
        const data = await this._request('/game/status', 'GET');
        this._setAccountStatus(data);
        return data;
    },

    // Load leaderboard
    async getLeaderboard() {
        return this._request('/game/leaderboard', 'GET');
    },

    // Get user profile
    async getProfile(username) {
        return this._request(`/game/profile/${encodeURIComponent(username)}`, 'GET');
    },

    // Chat: fetch messages (sinceId=null → last 50; sinceId=number → new since that id)
    async getChatMessages(sinceId) {
        const param = sinceId !== null && sinceId !== undefined ? `?since=${sinceId}` : '';
        return this._request(`/chat/messages${param}`, 'GET');
    },

    // Chat: send a message (requires login)
    async sendChatMessage(text) {
        return this._request('/chat/send', 'POST', { message: text });
    },

    // Admin: list all flagged users
    async getFlaggedUsers() {
        return this._request('/game/admin/flagged', 'GET');
    },

    // Admin: clear a user's flag
    async unflagUser(username) {
        return this._request(`/game/admin/unflag/${encodeURIComponent(username)}`, 'POST');
    },

    // Admin: manually flag a user
    async flagUser(username, reason) {
        return this._request(`/game/admin/flag/${encodeURIComponent(username)}`, 'POST', { reason });
    },

    // Admin: delete a user account
    async deleteUser(username) {
        return this._request(`/game/admin/user/${encodeURIComponent(username)}`, 'DELETE');
    },

    // Admin: rename a user account
    async renameUser(username, newUsername) {
        return this._request(`/game/admin/user/${encodeURIComponent(username)}/rename`, 'PATCH', { newUsername });
    },

    // Admin: get full user data (game_save, scores, flags, etc.)
    async getAdminUserData(username) {
        return this._request(`/game/admin/user/${encodeURIComponent(username)}/data`, 'GET');
    },

    // Admin: update any user fields (prestige_score, total_scrap, flagged, flag_reason, game_save, new_password)
    async updateAdminUserData(username, data) {
        return this._request(`/game/admin/user/${encodeURIComponent(username)}/data`, 'PATCH', data);
    },

    // Shared stock market: fetch current prices + history for all stocks
    async getStockPrices() {
        return this._request('/stocks/prices', 'GET');
    },

    // Shared stock market: register a trade to influence next price tick
    async recordStockTrade(stockId, shares, direction) {
        if (!this.token) return; // guests can trade client-side but don't affect market
        return this._request('/stocks/trade', 'POST', { stockId, shares, direction }).catch(() => {});
    },
};
