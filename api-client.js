// Astraforge API Client
// A simple helper to interact with the Astraforge Node.js backend.
// Include this file in your index.html: <script src="api-client.js"></script>

const API_BASE_URL = 'http://localhost:3005/api';

const AstraforgeAPI = {
    // Current logged-in user state
    token: localStorage.getItem('astraforge_token'),
    username: localStorage.getItem('astraforge_username'),

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

        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            data = { error: text || 'Non-JSON response' };
        }

        if (!response.ok) {
            throw new Error(data.error || 'API Request failed');
        }
        return data;
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
        return data;
    },

    // User Logout
    logout() {
        this.token = null;
        this.username = null;
        localStorage.removeItem('astraforge_token');
        localStorage.removeItem('astraforge_username');
    },

    // Check if user is logged in
    isLoggedIn() {
        return !!this.token;
    },

    // Save game state
    async saveGame(gameStateObject) {
        return this._request('/game/save', 'POST', { gameData: gameStateObject });
    },

    // Load game state
    async loadGame() {
        return this._request('/game/load', 'GET');
    }
};

// Expose globally
window.AstraforgeAPI = AstraforgeAPI;
