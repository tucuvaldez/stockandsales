import { useState, useEffect } from "react";
import { getProducts, createSale } from "../services/api";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

const fmt = (n) => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n);

export default function NewSale() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [descGlobalTipo, setDescGlobalTipo] = useState("pct");
  const [descGlobalVal, setDescGlobalVal] = useState("");

  useEffect(() => { getProducts({ nombre: search }).then(setProducts).catch(()=>{}); }, [search]);

  const addToCart = (p) => {
    if (p.stock === 0) { toast.error(`"${p.nombre}" no tiene stock`); return; }
    setCart((prev) => {
      const ex = prev.find((i) => i._id === p._id);
      if (ex) {
        if (ex.cantidad >= p.stock) { toast.error(`Stock máximo: ${p.stock}`); return prev; }
        return prev.map((i) => i._id===p._id ? {...i,cantidad:i.cantidad+1} : i);
      }
      return [...prev, {...p, cantidad:1, descItemPct:""}];
    });
  };

  const updateQty = (id, delta) => setCart((prev) => prev.map((i)=>i._id===id?{...i,cantidad:i.cantidad+delta}:i).filter((i)=>i.cantidad>0));
  const updateDesc = (id, val) => setCart((prev) => prev.map((i)=>i._id===id?{...i,descItemPct:val===""?"":Math.min(100,Math.max(0,Number(val)))}:i));
  const removeFromCart = (id) => setCart((prev) => prev.filter((i)=>i._id!==id));

  const subtotalBruto = cart.reduce((s,i)=>s+i.precio*i.cantidad,0);
  const subtotalConDescItems = cart.reduce((s,i)=>s+i.precio*i.cantidad*(1-(Number(i.descItemPct)||0)/100),0);
  const descGlobalNum = Number(descGlobalVal)||0;
  const descGlobalMonto = descGlobalTipo==="pct" ? subtotalConDescItems*(descGlobalNum/100) : Math.min(descGlobalNum,subtotalConDescItems);
  const totalFinal = Math.max(0, subtotalConDescItems - descGlobalMonto);
  const totalDescuentos = subtotalBruto - totalFinal;

  const handleSale = async () => {
    if (cart.length===0) { toast.error("El carrito está vacío"); return; }
    setSaving(true);
    try {
      await createSale({
        items: cart.map((i)=>({productoId:i._id,cantidad:i.cantidad,descuentoPct:Number(i.descItemPct)||0})),
        metodoPago, nota,
        descuentoGlobal:{tipo:descGlobalTipo,valor:descGlobalNum,monto:descGlobalMonto},
        totalFinal,
      });
      toast.success("¡Venta registrada!");
      setCart([]); setNota(""); setDescGlobalVal(""); setShowConfirm(false);
      navigate("/historial");
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 390px",gap:24,alignItems:"start"}}>
      {/* Izquierda */}
      <div>
        <div className="page-header" style={{marginBottom:20}}>
          <div><h2 className="page-title">Nueva Venta</h2><p className="page-subtitle">Buscá y agregá productos al carrito</p></div>
        </div>
        <div className="filters-bar">
          <input className="form-input" placeholder="🔍 Buscar por nombre..." value={search} onChange={(e)=>setSearch(e.target.value)} style={{maxWidth:"100%"}} />
        </div>
        {products.length===0 ? (
          <div className="empty-state card"><div className="empty-icon">🔍</div><p>No se encontraron productos</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Código</th><th>Nombre</th><th>Talle</th><th>Precio</th><th>Stock</th><th></th></tr></thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p._id} style={{opacity:p.stock===0?0.5:1}}>
                    <td className="mono">{p.codigo}</td>
                    <td style={{fontWeight:500}}>{p.nombre}</td>
                    <td>{p.talle||"—"}</td>
                    <td style={{fontWeight:600}}>{fmt(p.precio)}</td>
                    <td>{p.stock===0?<span className="badge badge-danger">Sin stock</span>:<span className="badge badge-success">{p.stock} ud.</span>}</td>
                    <td><button className="btn btn-sm btn-primary" onClick={()=>addToCart(p)} disabled={p.stock===0}>+ Agregar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Carrito */}
      <div style={{position:"sticky",top:24}}>
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"16px 20px",borderBottom:"1px solid var(--border)",background:"var(--surface2)"}}>
            <h3 style={{fontWeight:700,fontSize:16}}>🛒 Carrito</h3>
            <p style={{fontSize:13,color:"var(--text-muted)",marginTop:2}}>{cart.length===0?"Vacío":`${cart.reduce((s,i)=>s+i.cantidad,0)} producto(s)`}</p>
          </div>

          <div style={{padding:"0 20px",maxHeight:340,overflowY:"auto"}}>
            {cart.length===0 ? (
              <p style={{padding:"24px 0",textAlign:"center",color:"var(--text-muted)",fontSize:14}}>Agregá productos desde la izquierda</p>
            ) : cart.map((item) => {
              const desc = Number(item.descItemPct)||0;
              const precioDesc = item.precio*(1-desc/100);
              return (
                <div className="cart-item" key={item._id}>
                  <div style={{flex:1}}>
                    <div className="cart-item-name">{item.nombre}</div>
                    <div className="cart-item-meta">
                      {item.talle?`Talle: ${item.talle} · `:""}
                      {desc>0?(<><span style={{textDecoration:"line-through",color:"var(--text-light)"}}>{fmt(item.precio)}</span>{" "}<span style={{color:"var(--success)",fontWeight:600}}>{fmt(precioDesc)}</span></>):fmt(item.precio)}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:6}}>
                      <span style={{fontSize:12,color:"var(--text-muted)"}}>Desc. %</span>
                      <input type="number" min="0" max="100" placeholder="0" value={item.descItemPct}
                        onChange={(e)=>updateDesc(item._id,e.target.value)}
                        style={{width:54,padding:"3px 7px",fontSize:13,border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",fontFamily:"inherit",outline:"none"}} />
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <div className="cart-qty">
                      <button className="qty-btn" onClick={()=>updateQty(item._id,-1)}>−</button>
                      <span style={{fontWeight:700,minWidth:24,textAlign:"center"}}>{item.cantidad}</span>
                      <button className="qty-btn" onClick={()=>updateQty(item._id,1)} disabled={item.cantidad>=item.stock}>+</button>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:700,fontSize:14}}>{fmt(precioDesc*item.cantidad)}</div>
                      <button onClick={()=>removeFromCart(item._id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-muted)",fontSize:12}}>quitar</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {cart.length>0 && (
            <div style={{padding:"16px 20px",borderTop:"1px solid var(--border)"}}>
              {/* Descuento global */}
              <div style={{background:"var(--surface2)",borderRadius:"var(--radius-sm)",padding:"12px",marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>🏷️ Descuento sobre el total</div>
                <div style={{display:"flex",gap:8}}>
                  <select className="form-select" value={descGlobalTipo} onChange={(e)=>setDescGlobalTipo(e.target.value)} style={{width:120,padding:"6px 8px",fontSize:13}}>
                    <option value="pct">% Porcentaje</option>
                    <option value="monto">$ Monto fijo</option>
                  </select>
                  <input className="form-input" type="number" min="0" placeholder={descGlobalTipo==="pct"?"Ej: 10":"Ej: 500"} value={descGlobalVal} onChange={(e)=>setDescGlobalVal(e.target.value)} style={{flex:1,padding:"6px 10px",fontSize:13}} />
                  {descGlobalVal && <button className="btn btn-ghost btn-sm" onClick={()=>setDescGlobalVal("")}>✕</button>}
                </div>
                {descGlobalMonto>0 && <div style={{fontSize:12,color:"var(--success)",marginTop:6,fontWeight:600}}>Ahorrás: {fmt(descGlobalMonto)}</div>}
              </div>

              {/* Pago */}
              <div className="form-group" style={{marginBottom:10}}>
                <label className="form-label">Método de pago</label>
                <select className="form-select" value={metodoPago} onChange={(e)=>setMetodoPago(e.target.value)}>
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="transferencia">🏦 Transferencia</option>
                  <option value="tarjeta">💳 Tarjeta</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Nota (opcional)</label>
                <input className="form-input" placeholder="Ej: cliente frecuente..." value={nota} onChange={(e)=>setNota(e.target.value)} />
              </div>

              {/* Totales */}
              <div style={{borderTop:"1px solid var(--border)",paddingTop:12,marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text-muted)",marginBottom:4}}><span>Subtotal</span><span>{fmt(subtotalBruto)}</span></div>
                {totalDescuentos>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--success)",marginBottom:4}}><span>Descuentos aplicados</span><span>− {fmt(totalDescuentos)}</span></div>}
                <div style={{display:"flex",justifyContent:"space-between",fontWeight:800,fontSize:22,color:"var(--accent)",marginTop:8}}><span>TOTAL</span><span>{fmt(totalFinal)}</span></div>
              </div>

              <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",padding:"12px"}} onClick={()=>setShowConfirm(true)}>
                ✅ Confirmar venta
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal confirmación */}
      {showConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:440}}>
            <div className="modal-header"><h3 className="modal-title">Confirmar venta</h3></div>
            <div className="modal-body">
              <div style={{marginBottom:14}}>
                <span className="badge badge-neutral" style={{fontSize:14}}>
                  {metodoPago==="efectivo"?"💵 Efectivo":metodoPago==="transferencia"?"🏦 Transferencia":metodoPago==="tarjeta"?"💳 Tarjeta":"Otro"}
                </span>
              </div>
              {cart.map((i)=>{
                const desc=Number(i.descItemPct)||0;
                const precio=i.precio*(1-desc/100);
                return (
                  <div key={i._id} style={{display:"flex",justifyContent:"space-between",fontSize:14,padding:"7px 0",borderBottom:"1px solid var(--border)"}}>
                    <span>{i.nombre}{i.talle?` (${i.talle})`:""} × {i.cantidad}{desc>0&&<span style={{color:"var(--success)",fontSize:12}}> −{desc}%</span>}</span>
                    <strong>{fmt(precio*i.cantidad)}</strong>
                  </div>
                );
              })}
              {descGlobalMonto>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"7px 0",color:"var(--success)"}}><span>Desc. general ({descGlobalTipo==="pct"?`${descGlobalNum}%`:fmt(descGlobalNum)})</span><span>− {fmt(descGlobalMonto)}</span></div>}
              <div style={{display:"flex",justifyContent:"space-between",fontWeight:800,fontSize:20,marginTop:14,color:"var(--accent)"}}><span>Total</span><span>{fmt(totalFinal)}</span></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setShowConfirm(false)}>Volver</button>
              <button className="btn btn-primary" onClick={handleSale} disabled={saving}>{saving?"Guardando...":"Confirmar y guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
