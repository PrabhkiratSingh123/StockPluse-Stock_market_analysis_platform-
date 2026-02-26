import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('sp_access');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// On 401, try to refresh token
api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const originalRequest = error.config;

        // Do not intercept if the request is an authentication endpoint
        if (originalRequest.url === '/api/token/' || originalRequest.url === '/api/token/refresh/') {
            return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            try {
                const refresh = localStorage.getItem('sp_refresh');
                if (!refresh) throw new Error("No refresh token");

                const { data } = await axios.post('/api/token/refresh/', { refresh });
                localStorage.setItem('sp_access', data.access);
                api.defaults.headers.common['Authorization'] = `Bearer ${data.access}`;
                originalRequest.headers['Authorization'] = `Bearer ${data.access}`;
                return api(originalRequest);
            } catch (err) {
                localStorage.clear();
                window.location.href = '/';
                return Promise.reject(err);
            }
        }
        return Promise.reject(error);
    }
);

export default api;
