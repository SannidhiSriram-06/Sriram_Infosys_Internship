// Central API configuration — single source of truth for the backend URL.
// All components should import API_BASE from here instead of hardcoding URLs.
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://13.126.223.153:5000/api';
