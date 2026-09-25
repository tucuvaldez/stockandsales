import { api, getToken } from "../api";

/**
 * Imprime una de las páginas /imprimir/... dentro de un iframe oculto: no abre pestañas nuevas
 * (el navegador no lo bloquea) y, con impresión directa activada, sale por la impresora sin diálogo.
 */
export function printInFrame(path) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.src = path;
  document.body.appendChild(frame);
  // La página impresa avisa cuando terminó; por las dudas se limpia a los 2 minutos.
  const cleanup = () => frame.remove();
  const onMsg = (e) => {
    if (e.source === frame.contentWindow && e.data === "stocklocal:printed") {
      window.removeEventListener("message", onMsg);
      setTimeout(cleanup, 500);
    }
  };
  window.addEventListener("message", onMsg);
  setTimeout(cleanup, 120000);
}

// Lo llaman las páginas de impresión cuando ya cargaron los datos.
export function autoPrint() {
  setTimeout(() => {
    const done = () => window.parent !== window && window.parent.postMessage("stocklocal:printed", window.location.origin);
    window.addEventListener("afterprint", done, { once: true });
    window.print();
  }, 300);
}

export const inFrame = () => window.parent !== window;

// Abre un PDF protegido en una pestaña. La pestaña se abre antes de pedir el archivo para que no la bloqueen.
export async function openPdf(apiPath) {
  const w = window.open("", "_blank");
  try {
    const res = await fetch(`/api${apiPath}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo abrir el PDF");
    const url = URL.createObjectURL(await res.blob());
    if (w) w.location.href = url;
    else window.location.href = url;
  } catch (e) {
    w?.close();
    throw e;
  }
}

export const openFolder = () => api.post("/documents/abrir-carpeta");
