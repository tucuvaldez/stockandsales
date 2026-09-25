import { useAuth } from "../auth";

// Nombre del campo "variante" y ejemplos según el tipo de negocio configurado.
export function useProductConfig() {
  const { negocio } = useAuth();
  const p = negocio?.producto;
  return {
    varianteLabel: p?.varianteLabel || "Variante",
    usarVariante: p?.usarVariante ?? true,
    ejemplos: p?.ejemplos || { nombre: "Nombre del producto", variante: "Color, tamaño, modelo..." },
  };
}
