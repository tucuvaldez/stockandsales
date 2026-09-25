import { useState, useEffect, useCallback } from "react";
import { getProducts, createProduct, updateProduct, deleteProduct, adjustStock } from "../services/api";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";

const EMPTY = { codigo:"", nombre:"", descripcion:"", categoria:"", talle:"", precio:"", precioCompra:"", stock:"", stockMinimo:"5" };
const fmt = (n) => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n);

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [nombre, setNombre] = useState("");
  const [talle, setTalle] = useState("");
  const [codigo, setCodigo] = useState("");
  const [bajoStock, setBajoStock] = useState(searchParams.get("bajoStock") === "true");
  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [stockModal, setStockModal] = useState(null);
  const [stockVal, setStockVal] = useState("");
  const [stockOp, setStockOp] = useState("sumar");

  const load = useCallback(() => {
    setLoading(true);
    getProducts({ nombre, talle, codigo, bajoStock: bajoStock || undefined })
      .then(setProducts).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [nombre, talle, codigo, bajoStock]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditProduct(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (p) => {
    setEditProduct(p);
    setForm({ codigo:p.codigo, nombre:p.nombre, descripcion:p.descripcion, categoria:p.categoria, talle:p.talle, precio:p.precio, precioCompra:p.precioCompra, stock:p.stock, stockMinimo:p.stockMinimo });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.codigo || !form.nombre || !form.precio) { toast.error("Código, nombre y precio son obligatorios"); return; }
    setSaving(true);
    try {
      const payload = { ...form, precio:Number(form.precio), precioCompra:Number(form.precioCompra)||0, stock:Number(form.stock)||0, stockMinimo:Number(form.stockMinimo)||5 };
      if (editProduct) { await updateProduct(editProduct._id, payload); toast.success("Producto actualizado"); }
      else { await createProduct(payload); toast.success("Producto creado"); }
      setModalOpen(false); load();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const handleDelete = async (p) => {
    if (!confirm(`¿Eliminar "${p.nombre}"?`)) return;
    try { await deleteProduct(p._id); toast.success("Eliminado"); load(); } catch (e) { toast.error(e.message); }
  };

  const handleStockAdjust = async () => {
    if (!stockVal || isNaN(stockVal)) { toast.error("Ingresá una cantidad válida"); return; }
    try { await adjustStock(stockModal._id, Number(stockVal), stockOp); toast.success("Stock actualizado"); setStockModal(null); load(); }
    catch (e) { toast.error(e.message); }
  };

  const stockBadge = (p) => {
    if (p.stock === 0) return <span className="badge badge-danger">Sin stock</span>;
    if (p.stock <= p.stockMinimo) return <span className="badge badge-warning">{p.stock} ud.</span>;
    return <span className="badge badge-success">{p.stock} ud.</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">Productos</h2><p className="page-subtitle">{products.length} producto{products.length!==1?"s":""} encontrado{products.length!==1?"s":""}</p></div>
        <button className="btn btn-primary" onClick={openCreate}>+ Nuevo producto</button>
      </div>

      <div className="filters-bar">
        <input className="form-input" placeholder="🔍 Buscar por nombre..." value={nombre} onChange={(e)=>setNombre(e.target.value)} />
        <input className="form-input" placeholder="Talle..." value={talle} onChange={(e)=>setTalle(e.target.value)} style={{maxWidth:120}} />
        <input className="form-input mono" placeholder="Código..." value={codigo} onChange={(e)=>setCodigo(e.target.value.toUpperCase())} style={{maxWidth:140}} />
        <label style={{display:"flex",alignItems:"center",gap:7,fontSize:14,cursor:"pointer",userSelect:"none"}}>
          <input type="checkbox" checked={bajoStock} onChange={(e)=>setBajoStock(e.target.checked)} /> Solo bajo stock
        </label>
        {(nombre||talle||codigo||bajoStock) && <button className="btn btn-ghost btn-sm" onClick={()=>{setNombre("");setTalle("");setCodigo("");setBajoStock(false);}}>✕ Limpiar</button>}
      </div>

      {loading ? <div className="loader"><div className="spinner"/> Cargando...</div>
      : products.length===0 ? (
        <div className="empty-state card"><div className="empty-icon">📦</div><p>No se encontraron productos</p><small>Probá otros filtros o agregá uno nuevo</small></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th>Talle</th><th>Precio venta</th><th>Stock</th><th>Acciones</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p._id}>
                  <td className="mono">{p.codigo}</td>
                  <td><div style={{fontWeight:600}}>{p.nombre}</div>{p.descripcion&&<div style={{fontSize:12,color:"var(--text-muted)"}}>{p.descripcion}</div>}</td>
                  <td>{p.categoria||"—"}</td>
                  <td>{p.talle||"—"}</td>
                  <td style={{fontWeight:600}}>{fmt(p.precio)}</td>
                  <td>{stockBadge(p)}</td>
                  <td>
                    <div style={{display:"flex",gap:6}}>
                      <button className="btn btn-sm btn-secondary" onClick={()=>{setStockModal(p);setStockVal("");setStockOp("sumar");}}>📥 Stock</button>
                      <button className="btn btn-sm btn-ghost" onClick={()=>openEdit(p)}>✏️</button>
                      <button className="btn btn-sm btn-danger" onClick={()=>handleDelete(p)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal producto */}
      {modalOpen && (
        <div className="modal-overlay" onClick={(e)=>e.target===e.currentTarget&&setModalOpen(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">{editProduct?"Editar producto":"Nuevo producto"}</h3>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group"><label className="form-label">Código <span>*</span></label><input className="form-input mono" placeholder="Ej: ART-001" value={form.codigo} onChange={(e)=>setForm({...form,codigo:e.target.value.toUpperCase()})} /></div>
                <div className="form-group"><label className="form-label">Nombre <span>*</span></label><input className="form-input" placeholder="Nombre del producto" value={form.nombre} onChange={(e)=>setForm({...form,nombre:e.target.value})} /></div>
              </div>
              <div className="form-group"><label className="form-label">Descripción</label><input className="form-input" placeholder="Opcional" value={form.descripcion} onChange={(e)=>setForm({...form,descripcion:e.target.value})} /></div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Categoría</label><input className="form-input" placeholder="Ej: Ropa, Calzado..." value={form.categoria} onChange={(e)=>setForm({...form,categoria:e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Talle / Medida</label><input className="form-input" placeholder="Ej: M, 38, Único..." value={form.talle} onChange={(e)=>setForm({...form,talle:e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Precio venta <span>*</span></label><input className="form-input" type="number" placeholder="$0" min="0" value={form.precio} onChange={(e)=>setForm({...form,precio:e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Precio costo</label><input className="form-input" type="number" placeholder="$0" min="0" value={form.precioCompra} onChange={(e)=>setForm({...form,precioCompra:e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Stock inicial</label><input className="form-input" type="number" placeholder="0" min="0" value={form.stock} onChange={(e)=>setForm({...form,stock:e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Stock mínimo (alerta)</label><input className="form-input" type="number" placeholder="5" min="0" value={form.stockMinimo} onChange={(e)=>setForm({...form,stockMinimo:e.target.value})} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving?"Guardando...":editProduct?"Guardar cambios":"Crear producto"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal stock */}
      {stockModal && (
        <div className="modal-overlay" onClick={(e)=>e.target===e.currentTarget&&setStockModal(null)}>
          <div className="modal" style={{maxWidth:380}}>
            <div className="modal-header"><h3 className="modal-title">Ajustar stock</h3><button className="btn btn-ghost btn-sm" onClick={()=>setStockModal(null)}>✕</button></div>
            <div className="modal-body">
              <p style={{fontSize:14,marginBottom:16,color:"var(--text-muted)"}}><strong style={{color:"var(--text)"}}>{stockModal.nombre}</strong> — stock actual: <strong>{stockModal.stock} ud.</strong></p>
              <div className="form-group">
                <label className="form-label">Operación</label>
                <select className="form-select" value={stockOp} onChange={(e)=>setStockOp(e.target.value)}>
                  <option value="sumar">➕ Sumar (entrada de mercadería)</option>
                  <option value="restar">➖ Restar (ajuste manual)</option>
                  <option value="fijar">📌 Fijar cantidad exacta</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Cantidad</label><input className="form-input" type="number" placeholder="0" min="0" value={stockVal} onChange={(e)=>setStockVal(e.target.value)} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setStockModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleStockAdjust}>Aplicar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
