import { createClient } from "@supabase/supabase-js";

// Clave pública (publishable): es segura para usar en el navegador
const SUPABASE_URL = "https://zebaoyjohztufbonetem.supabase.co";
const SUPABASE_KEY = "sb_publishable_YRhnNnhJbQs8AwHXF8fZZw_m52Oe3Wp";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const COLUMNAS = ["nombre", "quien", "tipo", "desde", "hasta", "estado", "creada"];

// Escucha la tabla de solicitudes: carga todo y vuelve a cargar ante cualquier cambio
export function escucharSolicitudes(onDatos, onError) {
  let activo = true;
  const cargar = async () => {
    const { data, error } = await supabase.from("solicitudes").select("*");
    if (!activo) return;
    if (error) onError(error); else onDatos(data);
  };
  cargar();
  const canal = supabase
    .channel("solicitudes-cambios")
    .on("postgres_changes", { event: "*", schema: "public", table: "solicitudes" }, cargar)
    .subscribe();
  return () => { activo = false; supabase.removeChannel(canal); };
}

export async function guardarSolicitud(id, datos) {
  const fila = { id };
  for (const c of COLUMNAS) if (datos[c] !== undefined) fila[c] = datos[c];
  const { error } = await supabase.from("solicitudes").upsert(fila);
  if (error) throw error;
}

export async function borrarSolicitud(id) {
  const { error } = await supabase.from("solicitudes").delete().eq("id", id);
  if (error) throw error;
}

export async function leerClaves() {
  const { data, error } = await supabase.from("claves").select("id, clave");
  if (error) throw error;
  return Object.fromEntries(data.map(r => [r.id, r.clave]));
}

export async function guardarClave(id, clave) {
  const { error } = await supabase.from("claves").upsert({ id, clave });
  if (error) throw error;
}
