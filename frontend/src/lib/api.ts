import axios from 'axios';

// Requests go to the same origin; next.config.ts rewrites /api/* to the
// backend, so the httpOnly session cookie is sent automatically.
const api = axios.create({
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
