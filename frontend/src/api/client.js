import axios from 'axios';
import { Alert } from 'react-native';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL
    || "http://10.41.141.49:8000";

export const apiClient = axios.create({
    baseURL: BASE_URL,
    timeout: 90000,
    headers: { "Content-Type": "multipart/form-data" }
});

apiClient.interceptors.request.use(
    config => {
        if (config.data && !(config.data instanceof FormData)) {
            config.headers['Content-Type'] = 'application/json';
        }
        return config;
    },
    error => Promise.reject(error)
);

apiClient.interceptors.response.use(
    response => response,
    error => {
        if (!error.config || !error.config.skipErrorAlert) {
            Alert.alert("Bağlantı Hatası", error.response?.data?.detail || "Sunucuya ulaşılamıyor.");
        }
        return Promise.reject(error);
    }
);

export default apiClient;