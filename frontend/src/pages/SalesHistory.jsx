import { useState, useEffect, useCallback } from "react";
import { getSales, deleteSale, registrarDevolucion } from "../services/api";
import toast from "react-hot-toast";

const fmt = (n) => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n);
const fmtFecha = (d) => new Date(d).toLocaleString("es-AR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
const METODO = { efectivo:"💵 Efectivo", tarjeta:"💳 Tarjeta", transferencia:"🏦 Transferencia", otro:"Otro" };

export default function SalesHistory() {
  const [data, setData] = useState({sales:[],total:0,pages:1});
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [detalle, setDetalle] = useState(null);
  const [devModal, setDevModal] = useState(null);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    getSales({desde,hasta,page,limit:30}).then(setData).catch((e)=>toast.error(e.message)).finally(()=>setLoading(false));
  },[desde,hasta,page]);

  useEffect(()=>{load();},[load]);

  const handleAnular = async (sale) => {
    if (!confirm("¿Anular la venta completa? Se restaurará el stock de todos los productos.")) return;
    try { await deleteSale(sale._id); toast.success("Venta anulada y stock restaurado"); setDetalle(null); load(); }
    catch(e) { toast.error(e.message); }
  };

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">Historial de ventas</h2><p className="page-subtitle">{data.total} venta{data.total!==1?"s":""} registrada{data.total!==1?"s":""}</p></div>
      </div>

      <div className="filters-bar">
        <div style={{display:"flex",alignItems:"center",gap:8}}><label style={{fontSize:13,color:"var(--text-muted)"}}>Desde</label><input className="form-input" type="date" value={desde} onChange={(e)=>{setDesde(e.target.value);setPage(1);}} style={{maxWidth:160}} /></div>
        <div style={{display:"flex",alignItems:"center",gap:8}}><label style={{fontSize:13,color:"var(--text-muted)"}}>Hasta</label><input className="form-input" type="date" value={hasta} onChange={(e)=>{setHasta(e.target.value);setPage(1);}} style={{maxWidth:160}} /></div>
        {(desde||hasta)&&<button className="btn btn-ghost btn-sm" onClick={()=>{setDesde("");setHasta("");setPage(1);}}>✕ Limpiar</button>}
      </div>

      {loading ? <div className="loader"><div className="spinner"/> Cargando...</div>
      : data.sales.length===0 ? <div className="empty-state card"><div className="empty-icon">📋</div><p>No hay ventas en el período seleccionado</p></div>
      : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Productos</th><th>Pago</th><th>Total</th><th>Nota</th><th></th></tr></thead>
              <tbody>
                {data.sales.map((s)=>(
                  <tr key={s._id}>
                    <td style={{fontSize:13}}>{fmtFecha(s.fecha)}</td>
                    <td><div style={{fontSize:13}}>
                      {s.items.slice(0,2).map((i,idx)=><div key={idx}>{i.nombre}{i.talle?` (${i.talle})`:""} × {i.cantidad}</div>)}
                      {s.items.length>2&&<div style={{color:"var(--text-muted)"}}>+{s.items.length-2} más...</div>}
                    </div></td>
                    <td><span className="badge badge-neutral">{METODO[s.metodoPago]||s.metodoPago}</span></td>
                    <td style={{fontWeight:700,color:"var(--success)"}}>{fmt(s.total)}</td>
                    <td style={{fontSize:13,color:"var(--text-muted)"}}>{s.nota||"—"}</td>
                    <td><button className="btn btn-sm btn-secondary" onClick={()=>setDetalle(s)}>Ver detalle</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.pages>1&&(
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"center",alignItems:"center"}}>
              <button className="btn btn-secondary btn-sm" onClick={()=>setPage((p)=>Math.max(1,p-1))} disabled={page===1}>← Anterior</button>
              <span style={{fontSize:14,padding:"6px 12px",color:"var(--text-muted)"}}>Página {page} de {data.pages}</span>
              <button className="btn btn-secondary btn-sm" onClick={()=>setPage((p)=>Math.min(data.pages,p+1))} disabled={page===data.pages}>Siguiente →</button>
            </div>
          )}
        </>
      )}

      {/* Modal detalle */}
      {detalle&&(
        <div className="modal-overlay" onClick={(e)=>e.target===e.currentTarget&&setDetalle(null)}>
          <div className="modal" style={{maxWidth:580}}>
            <div className="modal-header"><h3 className="modal-title">Detalle de venta</h3><button className="btn btn-ghost btn-sm" onClick={()=>setDetalle(null)}>✕</button></div>
            <div className="modal-body">
              <div style={{display:"flex",gap:16,marginBottom:16,fontSize:14,flexWrap:"wrap",background:"var(--surface2)",padding:"10px 14px",borderRadius:"var(--radius-sm)"}}>
                <div><span className="text-muted">Fecha: </span><strong>{fmtFecha(detalle.fecha)}</strong></div>
                <div><span className="text-muted">Pago: </span><strong>{METODO[detalle.metodoPago]}</strong></div>
                {detalle.nota&&<div><span className="text-muted">Nota: </span><strong>{detalle.nota}</strong></div>}
              </div>
              <table>
                <thead><tr><th>Código</th><th>Producto</th><th>Talle</th><th>Cant.</th><th>P. unitario</th><th>Desc.</th><th>Subtotal</th></tr></thead>
                <tbody>
                  {detalle.items.map((i,idx)=>(
                    <tr key={idx}>
                      <td className="mono">{i.codigo}</td><td>{i.nombre}</td><td>{i.talle||"—"}</td><td>{i.cantidad}</td>
                      <td>{fmt(i.precioUnitario)}</td>
                      <td>{i.descuentoPct>0?<span className="badge badge-success">−{i.descuentoPct}%</span>:<span style={{color:"var(--text-light)"}}>—</span>}</td>
                      <td style={{fontWeight:600}}>{fmt(i.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid var(--border)"}}>
                {detalle.descuentoGlobal?.monto>0&&<div style={{display:"flex",justifyContent:"flex-end",gap:16,fontSize:13,color:"var(--success)",marginBottom:6}}><span>Descuento general</span><span>− {fmt(detalle.descuentoGlobal.monto)}</span></div>}
                <div style={{textAlign:"right",fontSize:20,fontWeight:800,color:"var(--accent)"}}>Total: {fmt(detalle.total)}</div>
              </div>
            </div>
            <div className="modal-footer" style={{justifyContent:"space-between"}}>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-sm" style={{background:"var(--warning-light)",color:"var(--warning)",border:"1px solid #f0d090"}}
                  onClick={()=>{setDevModal(detalle);setDetalle(null);}}>🔄 Devolución</button>
                <button className="btn btn-sm btn-danger" onClick={()=>handleAnular(detalle)}>🗑️ Anular venta</button>
              </div>
              <button className="btn btn-secondary" onClick={()=>setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {devModal&&<DevolucionModal sale={devModal} onClose={()=>setDevModal(null)} onDone={()=>{setDevModal(null);load();}} />}
    </div>
  );
}

function DevolucionModal({sale, onClose, onDone}) {
  const [cantidades, setCantidades] = useState(Object.fromEntries(sale.items.map((_,idx)=>[idx,0])));
  const [saving, setSaving] = useState(false);

  const totalDev = sale.items.reduce((s,item,idx)=>s+item.precioUnitario*(cantidades[idx]||0),0);
  const algunaDevolucion = Object.values(cantidades).some((v)=>v>0);
  const devuelveTodo = sale.items.every((_,idx)=>cantidades[idx]>=sale.items[idx].cantidad);

  const handleConfirm = async () => {
    if (!algunaDevolucion) { toast.error("Seleccioná al menos un producto"); return; }
    setSaving(true);
    try {
      const devoluciones = sale.items
        .map((item, idx) => ({ productoId: item.producto, cantidad: cantidades[idx] || 0 }))
        .filter((d) => d.cantidad > 0);
  
      const resultado = await registrarDevolucion(sale._id, devoluciones);
  
      if (resultado.deleted) {
        toast.success("Devolución total — venta eliminada del historial");
      } else {
        toast.success("Devolución parcial registrada — historial actualizado");
      }
      onDone();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e)=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:500}}>
        <div className="modal-header"><h3 className="modal-title">🔄 Registrar devolución</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <p style={{fontSize:14,color:"var(--text-muted)",marginBottom:16}}>Indicá cuántas unidades devuelve el cliente. El stock se restaura automáticamente.</p>
          {sale.items.map((item,idx)=>(
            <div key={idx} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14}}>{item.nombre}{item.talle?` (${item.talle})`:""}</div>
                <div style={{fontSize:12,color:"var(--text-muted)"}}>Vendidos: {item.cantidad} ud. · {fmt(item.precioUnitario)} c/u</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13,color:"var(--text-muted)"}}>Devuelve:</span>
                <div className="cart-qty">
                  <button className="qty-btn" onClick={()=>setCantidades((p)=>({...p,[idx]:Math.max(0,(p[idx]||0)-1)}))}>−</button>
                  <span style={{fontWeight:700,minWidth:28,textAlign:"center"}}>{cantidades[idx]||0}</span>
                  <button className="qty-btn" onClick={()=>setCantidades((p)=>({...p,[idx]:Math.min(item.cantidad,(p[idx]||0)+1)}))}>+</button>
                </div>
              </div>
            </div>
          ))}
          {algunaDevolucion&&(
            <div style={{background:"var(--warning-light)",border:"1px solid #f0d090",borderRadius:"var(--radius-sm)",padding:"10px 14px",marginTop:14,fontSize:14}}>
              <strong>Monto a devolver al cliente:</strong>{" "}
              <span style={{color:"var(--warning)",fontWeight:800}}>{fmt(totalDev)}</span>
              <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>
                {devuelveTodo?"Devolución total — se anulará la venta completa":"Devolución parcial — se restaura solo el stock seleccionado"}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" style={{background:"var(--warning-light)",color:"var(--warning)",border:"1px solid #f0d090"}}
            onClick={handleConfirm} disabled={saving||!algunaDevolucion}>
            {saving?"Procesando...":"Confirmar devolución"}
          </button>
        </div>
      </div>
    </div>
  );
}
