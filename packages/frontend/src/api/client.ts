import axios from 'axios';
import { useTenantStore } from '../store/tenantStore';

const client = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Append tenantId to GET requests for tenant-scoped resources
  const { activeTenant } = useTenantStore.getState();
  if (activeTenant && config.method === 'get') {
    const url = config.url || '';
    if (['/projects', '/tasks', '/jobs'].some(p => url.startsWith(p))) {
      config.params = { ...config.params, tenantId: activeTenant.id };
    }
  }

  return config;
});

client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
