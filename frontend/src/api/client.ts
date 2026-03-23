import axios from 'axios';

// Production: use relative path (nginx proxies /api -> backend)
// Development: direct connect to backend on port 8000
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD
    ? ''
    : `${window.location.protocol}//${window.location.hostname}:8000`);

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000, // 10 s — prevents infinite loading when backend is unreachable
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: add JWT token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
