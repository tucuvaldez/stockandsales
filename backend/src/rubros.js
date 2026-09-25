// Tipos de negocio: adaptan textos y sugerencias para que el sistema no parezca hecho para un solo rubro.
const RUBROS = {
  ropa: {
    nombre: "Ropa y calzado", variante: "Talle",
    ejemplos: { nombre: "Remera algodón", variante: "M, 38, Único..." },
    categorias: ["Remeras", "Pantalones", "Abrigos", "Calzado", "Accesorios"],
  },
  almacen: {
    nombre: "Almacén / kiosco", variante: "Presentación",
    ejemplos: { nombre: "Yerba mate", variante: "1 kg, 500 ml, x6..." },
    categorias: ["Almacén", "Bebidas", "Lácteos", "Golosinas", "Limpieza", "Cigarrillos"],
  },
  jugueteria: {
    nombre: "Juguetería", variante: "Edad / modelo",
    ejemplos: { nombre: "Rompecabezas 500 piezas", variante: "+6 años, modelo A..." },
    categorias: ["Juegos de mesa", "Muñecos", "Didácticos", "Aire libre", "Bebés"],
  },
  regaleria: {
    nombre: "Regalería / bazar", variante: "Color / modelo",
    ejemplos: { nombre: "Taza cerámica", variante: "Rojo, grande..." },
    categorias: ["Bazar", "Decoración", "Cotillón", "Regalos", "Librería"],
  },
  ferreteria: {
    nombre: "Ferretería", variante: "Medida",
    ejemplos: { nombre: "Tornillo autoperforante", variante: '8 x 1", 10 mm...' },
    categorias: ["Herramientas", "Electricidad", "Plomería", "Pinturería", "Bulonería"],
  },
  libreria: {
    nombre: "Librería", variante: "Color / tipo",
    ejemplos: { nombre: "Cuaderno tapa dura", variante: "Rayado, A4..." },
    categorias: ["Escolar", "Oficina", "Arte", "Papelería", "Libros"],
  },
  otro: {
    nombre: "Otro", variante: "Variante",
    ejemplos: { nombre: "Nombre del producto", variante: "Color, tamaño, modelo..." },
    categorias: [],
  },
};

const rubroOrDefault = (k) => (RUBROS[k] ? k : "otro");

module.exports = { RUBROS, rubroOrDefault };
