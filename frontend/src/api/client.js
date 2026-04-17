import axios from 'axios';
import { Alert } from 'react-native';

const apiClient = axios.create({
    baseURL: "http://192.168.1.101:8000", // Güncellenen yeni IP adresiniz
    timeout: 10000,
});

apiClient.interceptors.response.use(
    response => response,
    error => {
        Alert.alert("Bağlantı Hatası", error.response?.data?.detail || "Sunucuya ulaşılamıyor.");
        return Promise.reject(error);
    }
);

export default apiClient;