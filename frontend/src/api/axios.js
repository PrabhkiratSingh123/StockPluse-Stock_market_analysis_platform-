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

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// On 401, try to refresh token
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Do not intercept if the request is an authentication endpoint
        if (originalRequest.url === '/api/token/' || originalRequest.url === '/api/token/refresh/' || !originalRequest) {
            return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise(function(resolve, reject) {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers['Authorization'] = 'Bearer ' + token;
                    originalRequest._retry = true;
                    return api(originalRequest);
                }).catch(err => {
                    return Promise.reject(err);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const refresh = localStorage.getItem('sp_refresh');
                if (!refresh) throw new Error("No refresh token");

                const { data } = await axios.post('/api/token/refresh/', { refresh });
                const token = data.access;
                localStorage.setItem('sp_access', token);
                
                api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                originalRequest.headers['Authorization'] = `Bearer ${token}`;
                
                processQueue(null, token);
                isRefreshing = false;
                
                return api(originalRequest);
            } catch (err) {
                processQueue(err, null);
                isRefreshing = false;
                localStorage.clear();
                window.location.href = '/';
                return Promise.reject(err);
            }
        }
        return Promise.reject(error);
    }
);

export default api;
