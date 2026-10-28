import axios, { type AxiosResponse } from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.response.use(
  (res) => res,
  (error) => {
    const message = error.response?.data?.message
      ?? (typeof error.response?.data === 'string' ? error.response.data
      : `HTTP ${error.response?.status}`)
    return Promise.reject(new Error(Array.isArray(message) ? message.join('，') : message || '请求失败'))
  }
)

export const unwrap = <T>(res: Promise<AxiosResponse<T>>): Promise<T> =>
  res.then((r) => r.data)

export default client
