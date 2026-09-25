import axios from "axios";
const api = axios.create({ baseURL: "/api", headers: { "Content-Type": "application/json" } });
api.interceptors.response.use((r) => r, (err) => Promise.reject(new Error(err.response?.data?.error || "Error de conexión")));

export const getProducts = (p = {}) => api.get("/products", { params: p }).then((r) => r.data);
export const createProduct = (d) => api.post("/products", d).then((r) => r.data);
export const updateProduct = (id, d) => api.put(`/products/${id}`, d).then((r) => r.data);
export const adjustStock = (id, cantidad, operacion) => api.patch(`/products/${id}/stock`, { cantidad, operacion }).then((r) => r.data);
export const deleteProduct = (id) => api.delete(`/products/${id}`).then((r) => r.data);

export const getSales = (p = {}) => api.get("/sales", { params: p }).then((r) => r.data);
export const createSale = (d) => api.post("/sales", d).then((r) => r.data);
export const deleteSale = (id) => api.delete(`/sales/${id}`).then((r) => r.data);

export const getDashboard = () => api.get("/stats/dashboard").then((r) => r.data);

export const registrarDevolucion = (id, devoluciones) =>
  api.patch(`/sales/${id}/devolucion`, { devoluciones }).then((r) => r.data);