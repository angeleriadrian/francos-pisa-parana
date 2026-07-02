import { useState, useEffect, useMemo } from "react";
import { Calendar, Table2, Plus, X, Clock, Trash2, User, Plane, FileText } from "lucide-react";
import { db } from "./firebase";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, getDoc, getDocs
} from "firebase/firestore";

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

const AUTORIZADOS = {
  "angeleri": "elgato",
  "manes": "lionel",
  "franza": "heraldo",
  "romero": "nico",
  "ruiz diaz": "maxi",
  "chemez": null,
  "bestoso": "bofor",
  "navarro": "walter",
  "zunino": "marcelo",
  "palazzini": "paco",
  "nocetti": "puma",
  "espinola": "loro",
  "pisa guardia": null,
  "karp/suarez": "conde",
};

const SOLO_LECTURA = ["pisa guardia", "chemez"];

const CUENTAS_COMPARTIDAS = {
  "karp/suarez": ["Karp", "Suarez"],
};

const SALDO_INICIAL = {
  "angeleri": 30, "bestoso": 30, "manes": 30, "navarro": 30,
  "nocetti": 3, "palazzini": 3, "espinola": 30, "franza": 1,
  "ruiz diaz": 30, "romero": 6, "zunino": 30,
};

const TIPOS = {
  vacaciones: { label: "Vacaciones", color: "#1C8C6E", bg: "#E2F3EC", icon: Plane },
  especial:   { label: "Licencia especial", color: "#C4622D", bg: "#FAE9DD", icon: FileText },
  mensual:    { label: "Franco", color: "#2D7A8A", bg: "#E2F0F2", icon: Clock },
  navidad:    { label: "Navidad", color: "#A23B52", bg: "#F8E5EA", icon: FileText },
  anio_nuevo: { label: "Año Nuevo", color: "#7A5BAF", bg: "#EFE7F8", icon: FileText },
};

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_SEMANA = ["L","M","X","J","V","S","D"];

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }
function fmt(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function firstWeekdayMon0(year, month) { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1; }
function dateRange(start, end) {
  const out = [];
  let cur = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (cur <= last) { out.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
  return out;
}

function diasAcumulados(persona, solicitudes, anioRef, mesRef) {
  const hoy = new Date();
  const anio = anioRef ?? hoy.getFullYear();
  const mesNum = mesRef ?? (hoy.getMonth() + 1);
  const clavePersona = persona.trim().toLowerCase();

  const activasPersona = solicitudes.filter(
    s => s.nombre === persona && s.estado !== "rechazada" && (s.tipo === "mensual" || s.tipo === "especial")
  );

  // Si estamos en 2026 desde julio en adelante, arrancamos con el saldo inicial cargado.
  if (anio === 2026 && mesNum >= 7) {
    const saldoBase = SALDO_INICIAL[clavePersona] ?? 0;
    let balance = saldoBase;
    for (let mes = 7; mes <= mesNum; mes++) {
      const claveMes = `${anio}-${String(mes).padStart(2, "0")}`;
      const usadoEseMes = activasPersona
        .flatMap(s => dateRange(s.desde, s.hasta))
        .filter(d => d.startsWith(claveMes)).length;
      const acreditado = mes === 7 ? 3 : mes === 12 ? 7 : 10;
      if (mes > 7) balance = Math.min(30, balance + acreditado);
      balance -= usadoEseMes;
    }
    return balance;
  }

  // Para enero/febrero/marzo: no se suman días nuevos pero sí se arrastra
  // el saldo del diciembre anterior. Calculamos diciembre del año previo y
  // descontamos lo usado en los meses de enero a mesNum del año actual.
  if (mesNum <= 3) {
    // Calcular saldo al cierre de diciembre del año anterior
    let balanceDic = 0;
    const anioAnterior = anio - 1;
    const activasAnioAnterior = solicitudes.filter(
      s => s.nombre === persona && s.estado !== "rechazada" && (s.tipo === "mensual" || s.tipo === "especial")
    );
    for (let mes = 1; mes <= 12; mes++) {
      const claveMes = `${anioAnterior}-${String(mes).padStart(2, "0")}`;
      const usadoEseMes = activasAnioAnterior
        .flatMap(s => dateRange(s.desde, s.hasta))
        .filter(d => d.startsWith(claveMes)).length;
      const acreditado = mes <= 3 ? 0 : mes === 7 ? 3 : mes === 12 ? 7 : 10;
      balanceDic = Math.min(30, balanceDic + acreditado) - usadoEseMes;
    }
    // Descontar lo usado en enero/febrero/marzo del año actual
    let balance = balanceDic;
    for (let mes = 1; mes <= mesNum; mes++) {
      const claveMes = `${anio}-${String(mes).padStart(2, "0")}`;
      const usadoEseMes = activasPersona
        .flatMap(s => dateRange(s.desde, s.hasta))
        .filter(d => d.startsWith(claveMes)).length;
      balance -= usadoEseMes; // no se suman días nuevos (acreditado = 0)
    }
    return balance;
  }

  // Resto del año: cálculo normal desde enero.
  let balance = 0;
  for (let mes = 1; mes <= mesNum; mes++) {
    const claveMes = `${anio}-${String(mes).padStart(2, "0")}`;
    const usadoEseMes = activasPersona
      .flatMap(s => dateRange(s.desde, s.hasta))
      .filter(d => d.startsWith(claveMes)).length;
    const acreditado = mes <= 3 ? 0 : mes === 7 ? 3 : mes === 12 ? 7 : 10;
    balance = Math.min(30, balance + acreditado) - usadoEseMes;
  }
  return balance;
}

// ─── ESTILOS BASE ─────────────────────────────────────────────────────────────

const th = { padding:"11px 14px", fontSize:11.5, color:"#8A8170", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5 };
const td = { padding:"11px 14px", color:"#2B2620" };
const lbl = { display:"block", fontSize:12.5, color:"#8A8170", fontWeight:600, marginBottom:6 };
const inp = { width:"100%", padding:"10px 12px", border:"1.5px solid #E7E1D4", borderRadius:10, fontSize:14, outline:"none", fontFamily:"system-ui", boxSizing:"border-box" };
function iconBtn(color) { return { border:"none", background:`${color}14`, color, borderRadius:8, padding:6, cursor:"pointer", display:"flex" }; }

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function App() {
  const [nombre, setNombre] = useState("");
  const [registrado, setRegistrado] = useState(false);
  const [vista, setVista] = useState("calendario");
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [errorLogin, setErrorLogin] = useState(null);
  const [clave, setClave] = useState("");
  const [clavesOverride, setClavesOverride] = useState({});
  const [modalClaveAbierto, setModalClaveAbierto] = useState(false);
  const [claveActualInput, setClaveActualInput] = useState("");
  const [claveNuevaInput, setClaveNuevaInput] = useState("");
  const [claveNuevaInput2, setClaveNuevaInput2] = useState("");
  const [errorClave, setErrorClave] = useState(null);
  const [avisoClave, setAvisoClave] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [hoy] = useState(new Date());
  const [mesActual, setMesActual] = useState(hoy.getMonth());
  const [anioActual, setAnioActual] = useState(hoy.getFullYear());
  const [form, setForm] = useState({ tipo: "vacaciones", desde: "", hasta: "", quien: "" });

  // Suscripción en tiempo real a Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "solicitudes"), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (a.desde < b.desde ? 1 : -1));
      setSolicitudes(items);
      setCargando(false);
    }, (err) => {
      console.error(err);
      setError("No se pudieron cargar las licencias. Verificá tu conexión.");
      setCargando(false);
    });
    return () => unsub();
  }, []);

  // Cargar contraseñas personalizadas
  useEffect(() => {
    cargarClaves();
  }, []);

  async function cargarClaves() {
    try {
      const snap = await getDocs(collection(db, "claves"));
      const mapa = {};
      snap.forEach(d => { mapa[d.id] = d.data().clave; });
      setClavesOverride(mapa);
    } catch (e) { /* seguimos con claves originales */ }
  }

  async function cambiarClave() {
    setErrorClave(null);
    setAvisoClave(null);
    const limpio = nombre.trim().toLowerCase();
    const claveOriginal = clavesOverride[limpio] ?? AUTORIZADOS[Object.keys(AUTORIZADOS).find(k => k.trim().toLowerCase() === limpio)];
    if (claveOriginal && claveActualInput !== claveOriginal) {
      setErrorClave("La contraseña actual no es correcta.");
      return;
    }
    if (!claveNuevaInput || claveNuevaInput.length < 4) {
      setErrorClave("La contraseña nueva tiene que tener al menos 4 caracteres.");
      return;
    }
    if (claveNuevaInput !== claveNuevaInput2) {
      setErrorClave("Las dos contraseñas nuevas no coinciden.");
      return;
    }
    try {
      await setDoc(doc(db, "claves", limpio), { clave: claveNuevaInput });
      setClavesOverride(prev => ({ ...prev, [limpio]: claveNuevaInput }));
      setAvisoClave("Contraseña actualizada correctamente.");
      setClaveActualInput(""); setClaveNuevaInput(""); setClaveNuevaInput2("");
    } catch (e) {
      setErrorClave("No se pudo guardar la nueva contraseña. Probá de nuevo.");
    }
  }

  function intentarEntrar() {
    const limpio = nombre.trim();
    if (!limpio) return;
    const clavePersona = Object.entries(AUTORIZADOS).find(([k]) => k.trim().toLowerCase() === limpio.toLowerCase());
    if (!clavePersona) {
      setErrorLogin("Ese nombre no está habilitado para entrar.");
      return;
    }
    const claveCorrecta = clavesOverride[limpio.toLowerCase()] ?? clavePersona[1];
    if (claveCorrecta && clave !== claveCorrecta) {
      setErrorLogin("Contraseña incorrecta.");
      return;
    }
    setErrorLogin(null);
    setRegistrado(true);
  }

  const esSoloLectura = SOLO_LECTURA.some(u => u.trim().toLowerCase() === nombre.trim().toLowerCase());
  const parejaCompartida = CUENTAS_COMPARTIDAS[nombre.trim().toLowerCase()] || null;

  async function crearSolicitud() {
    if (!form.desde || !form.hasta || !nombre || enviando || esSoloLectura) return;
    setEnviando(true);
    try {
      setError(null);
      setAviso(null);

      const diasPedidos = dateRange(form.desde, form.hasta);
      const activas = solicitudes.filter(s => s.estado !== "rechazada");

      if (parejaCompartida && !form.quien) {
        setError(`Elegí quién de los dos (${parejaCompartida.join(" o ")}) está pidiendo esta licencia.`);
        return;
      }

      if (parejaCompartida && form.tipo === "mensual") {
        const superpone = activas.some(s =>
          s.nombre === nombre && s.tipo === "mensual" && s.quien !== form.quien &&
          dateRange(s.desde, s.hasta).some(d => diasPedidos.includes(d))
        );
        if (superpone) {
          setError(`Los días de Franco no se pueden superponer entre ${parejaCompartida.join(" y ")}.`);
          return;
        }
      }

      const diasYaPedidos = activas.filter(s => s.nombre === nombre).flatMap(s => dateRange(s.desde, s.hasta));
      const dup = diasPedidos.filter(d => diasYaPedidos.includes(d));
      if (dup.length > 0) {
        setError(`Ya tenés una licencia pedida para el ${fmt(dup[0])}. No podés pedir el mismo día dos veces.`);
        return;
      }

      if (form.tipo === "mensual" && !parejaCompartida) {
        if (diasPedidos.length < 2) { setError("El Franco se pide por un mínimo de 2 días."); return; }
        const limite = new Date(); limite.setMonth(limite.getMonth() + 3);
        const fechaDesde = new Date(form.desde + "T00:00:00");
        if (fechaDesde > limite) { setError("No se puede pedir Franco a más de 3 meses de hoy."); return; }
        if ((fechaDesde.getTime() - Date.now()) / 3600000 < 72) {
          setError(`No se puede pedir Franco: se necesitan al menos 72 horas de anticipación (${fmt(form.desde)}).`); return;
        }
      }

      if ((form.tipo === "navidad" || form.tipo === "anio_nuevo") && diasPedidos.some(d => d.slice(5,7) !== "12")) {
        setError(`${TIPOS[form.tipo].label} solo se puede pedir en diciembre.`); return;
      }

      if (form.tipo === "especial" && diasPedidos.length <= 10) {
        setError(`La licencia especial tiene que ser de más de 10 días. Pediste ${diasPedidos.length}.`); return;
      }

      if (form.tipo === "mensual" || form.tipo === "especial") {
        for (const dia of diasPedidos) {
          const personasEseDia = new Set(activas.filter(s => (s.tipo === "mensual" || s.tipo === "especial") && dateRange(s.desde, s.hasta).includes(dia)).map(s => s.nombre));
          if (personasEseDia.size >= 4 && !personasEseDia.has(nombre)) {
            setError(`No se puede pedir: el ${fmt(dia)} ya hay 4 personas con Franco o Licencia especial, que es el máximo permitido.`);
            return;
          }
        }
      }

      let avisoCupo = null;

      let tipoFinal = form.tipo;
      if (!parejaCompartida) {
        const meses = new Set(diasPedidos.map(d => d.slice(0, 7)));
        for (const mes of meses) {
          const yaUsados = activas.filter(s => s.nombre === nombre && (s.tipo === "mensual" || s.tipo === "especial")).flatMap(s => dateRange(s.desde, s.hasta)).filter(d => d.slice(0,7) === mes).length;
          const nuevos = diasPedidos.filter(d => d.slice(0,7) === mes).length;
          if (yaUsados + nuevos > 10) {
            if (form.tipo === "mensual") tipoFinal = "especial";
            else if (form.tipo === "especial") {
              const [, m] = mes.split("-").map(Number);
              setError(`En ${MESES[m-1]} ya tenés ${yaUsados} días entre Franco y Especial. La suma no puede superar 10 días.`); return;
            }
          }
        }
      }

      const avisos = [];
      if (tipoFinal !== form.tipo) avisos.push(`Se guardó como "${TIPOS.especial.label}" por superar los 10 días del mes.`);
      if (tipoFinal === "especial" && !parejaCompartida) {
        const saldoAntes = diasAcumulados(nombre, solicitudes);
        const saldoDespues = saldoAntes - diasPedidos.length;
        avisos.push(saldoDespues < 0
          ? `Atención: te quedan ${saldoAntes} días acumulados y pedís ${diasPedidos.length}. Saldo: ${saldoDespues}.`
          : `Te quedan ${saldoDespues} días acumulados después de esta licencia.`
        );
      }
      if (avisos.length > 0) setAviso(avisos.join(" "));

      const nueva = {
        nombre,
        quien: parejaCompartida ? form.quien : "",
        tipo: tipoFinal,
        desde: form.desde,
        hasta: form.hasta,
        estado: "aprobada",
        creada: new Date().toISOString(),
      };
      const newId = uid();
      await setDoc(doc(db, "solicitudes", newId), nueva);

      setModalAbierto(false);
      const fi = new Date(form.desde + "T00:00:00");
      setMesActual(fi.getMonth());
      setAnioActual(fi.getFullYear());
      setForm({ tipo: "vacaciones", desde: "", hasta: "", quien: "" });
    } finally {
      setEnviando(false);
    }
  }

  async function eliminarSolicitud(id) {
    if (esSoloLectura) return;
    const item = solicitudes.find(s => s.id === id);
    if (item && item.tipo === "mensual" && !CUENTAS_COMPARTIDAS[item.nombre.trim().toLowerCase()]) {
      const fechaDesde = new Date(item.desde + "T00:00:00");
      if ((fechaDesde.getTime() - Date.now()) / 3600000 < 72) {
        setError(`No se puede eliminar este Franco: el plazo de 72 horas antes del ${fmt(item.desde)} ya venció.`);
        return;
      }
    }
    try {
      await deleteDoc(doc(db, "solicitudes", id));
    } catch (e) { setError("No se pudo eliminar. Probá de nuevo."); }
  }

  // ─── COMPUTADOS ─────────────────────────────────────────────────────────────

  const personas = useMemo(() => {
    const set = new Set(solicitudes.map(s => s.nombre));
    return Array.from(set).sort((a, b) => {
      const ac = !!CUENTAS_COMPARTIDAS[a.trim().toLowerCase()];
      const bc = !!CUENTAS_COMPARTIDAS[b.trim().toLowerCase()];
      if (ac && !bc) return 1; if (!ac && bc) return -1;
      return a.localeCompare(b);
    });
  }, [solicitudes]);

  const diasDelMes = useMemo(() => {
    const total = daysInMonth(anioActual, mesActual);
    const inicio = firstWeekdayMon0(anioActual, mesActual);
    const celdas = [];
    for (let i = 0; i < inicio; i++) celdas.push(null);
    for (let d = 1; d <= total; d++) {
      const dateStr = `${anioActual}-${String(mesActual+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const eventos = solicitudes.filter(s => s.estado !== "rechazada" && !CUENTAS_COMPARTIDAS[s.nombre.trim().toLowerCase()] && dateRange(s.desde, s.hasta).includes(dateStr));
      celdas.push({ d, dateStr, eventos });
    }
    return celdas;
  }, [anioActual, mesActual, solicitudes]);

  function mesAnterior() { if (mesActual === 0) { setMesActual(11); setAnioActual(a => a-1); } else setMesActual(m => m-1); }
  function mesSiguiente() { if (mesActual === 11) { setMesActual(0); setAnioActual(a => a+1); } else setMesActual(m => m+1); }

  // ─── PANTALLA LOGIN ──────────────────────────────────────────────────────────

  if (!registrado) {
    return (
      <div style={{minHeight:"100vh", background:"linear-gradient(180deg,#EFF5F4 0%,#F7F4EE 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif", padding:16}}>
        <div style={{background:"#fff", borderRadius:20, padding:"44px 36px", maxWidth:380, width:"100%", boxShadow:"0 24px 48px -12px rgba(20,60,70,0.18)"}}>
          <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:28}}>
            <div style={{width:44, height:44, borderRadius:13, background:"linear-gradient(135deg,#1C5A66,#2D7A8A)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 6px 14px -4px rgba(28,90,102,0.45)"}}>
              <Calendar size={22} color="#fff"/>
            </div>
            <div>
              <div style={{fontSize:21, fontWeight:700, color:"#1F2A2C", letterSpacing:"-0.01em"}}>Francos PISA Paraná</div>
              <div style={{fontSize:12.5, color:"#7E8C8D", fontFamily:"system-ui", letterSpacing:"0.02em"}}>EQUIPO COMPARTIDO</div>
            </div>
          </div>
          <input value={nombre} onChange={e => { setNombre(e.target.value); setErrorLogin(null); }}
            onKeyDown={e => e.key === "Enter" && intentarEntrar()} placeholder="Tu nombre"
            style={{...inp, marginBottom:12}}/>
          {(() => {
            const entrada = Object.entries(AUTORIZADOS).find(([k]) => k.trim().toLowerCase() === nombre.trim().toLowerCase());
            const necesitaClave = entrada && (clavesOverride[nombre.trim().toLowerCase()] ?? entrada[1]);
            if (!necesitaClave) return null;
            return <input type="password" value={clave} onChange={e => { setClave(e.target.value); setErrorLogin(null); }}
              onKeyDown={e => e.key === "Enter" && intentarEntrar()} placeholder="Contraseña"
              style={{...inp, marginBottom:12}}/>;
          })()}
          {errorLogin && <div style={{background:"#FAE9DD", border:"1px solid #E8B98C", color:"#C4622D", padding:"9px 12px", borderRadius:10, marginBottom:14, fontSize:13, fontFamily:"system-ui"}}>{errorLogin}</div>}
          <button onClick={intentarEntrar} disabled={!nombre.trim()}
            style={{width:"100%", padding:"12px 14px", background: nombre.trim() ? "linear-gradient(135deg,#1C5A66,#2D7A8A)":"#D7DEDD", color:"#fff", border:"none", borderRadius:12, fontSize:15, fontWeight:700, fontFamily:"system-ui", cursor: nombre.trim()?"pointer":"default", boxShadow: nombre.trim()?"0 8px 18px -6px rgba(28,90,102,0.5)":"none"}}>
            Entrar
          </button>
          <p style={{fontSize:11.5, color:"#9CA8A7", fontFamily:"system-ui", marginTop:16, lineHeight:1.4, textAlign:"center"}}>
            Tus datos son visibles para el equipo.
          </p>
        </div>
      </div>
    );
  }

  // ─── APP PRINCIPAL ───────────────────────────────────────────────────────────

  const claveMesActual = `${anioActual}-${String(mesActual+1).padStart(2,"0")}`;
  const todosLosUsuarios = Object.keys(AUTORIZADOS)
    .filter(u => !SOLO_LECTURA.some(s => s.toLowerCase() === u.toLowerCase()))
    .sort((a, b) => {
      const ac = !!CUENTAS_COMPARTIDAS[a.toLowerCase()], bc = !!CUENTAS_COMPARTIDAS[b.toLowerCase()];
      if (ac && !bc) return 1; if (!ac && bc) return -1;
      return a.localeCompare(b);
    });

  return (
    <div style={{minHeight:"100vh", background:"#F4F1EA", fontFamily:"system-ui,-apple-system,sans-serif"}}>

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#163E47,#1C5A66 60%,#2D7A8A)", padding:"22px 24px 26px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:14, borderRadius:"0 0 22px 22px", boxShadow:"0 10px 30px -10px rgba(20,55,65,0.45)"}}>
        <div style={{display:"flex", alignItems:"center", gap:12}}>
          <div style={{width:38, height:38, borderRadius:11, background:"rgba(255,255,255,0.16)", display:"flex", alignItems:"center", justifyContent:"center", border:"1px solid rgba(255,255,255,0.18)"}}>
            <Calendar size={19} color="#fff"/>
          </div>
          <div>
            <div style={{fontFamily:"Georgia,serif", fontSize:19, fontWeight:700, color:"#fff", letterSpacing:"-0.01em"}}>Francos PISA Paraná</div>
            <div style={{fontSize:12.5, color:"rgba(255,255,255,0.75)", display:"flex", alignItems:"center", gap:5, marginTop:1}}>
              <User size={12}/> {nombre}
              {esSoloLectura ? " · Solo lectura" : parejaCompartida ? " · Cuenta compartida" : ` · ${diasAcumulados(nombre, solicitudes)} días acumulados`}
            </div>
          </div>
        </div>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <button onClick={() => { setErrorClave(null); setAvisoClave(null); setClaveActualInput(""); setClaveNuevaInput(""); setClaveNuevaInput2(""); setModalClaveAbierto(true); }}
            style={{background:"rgba(255,255,255,0.14)", color:"#fff", border:"1px solid rgba(255,255,255,0.25)", borderRadius:12, padding:"10px 14px", fontWeight:600, fontSize:13, cursor:"pointer"}}>
            Mi contraseña
          </button>
          {!esSoloLectura && (
            <button onClick={() => { if (parejaCompartida) setForm(f => ({...f, tipo:"mensual"})); setModalAbierto(true); }}
              style={{display:"flex", alignItems:"center", gap:6, background:"#E8A23D", color:"#241A0A", border:"none", borderRadius:12, padding:"10px 18px", fontWeight:700, fontSize:14, cursor:"pointer", boxShadow:"0 8px 18px -6px rgba(232,162,61,0.55)"}}>
              <Plus size={16}/> Pedir licencia
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex", padding:"18px 24px 0", maxWidth:1100, margin:"0 auto"}}>
        <div style={{display:"flex", gap:3, background:"#E7E1D4", borderRadius:12, padding:4}}>
          {[{k:"calendario",label:"Calendario",icon:Calendar},{k:"tabla",label:"Grilla",icon:Table2}].map(t => {
            const Icon = t.icon; const activo = vista === t.k;
            return (
              <button key={t.k} onClick={() => setVista(t.k)}
                style={{display:"flex", alignItems:"center", gap:6, padding:"8px 18px", borderRadius:9, border:"none", background: activo?"#fff":"transparent", color: activo?"#1C5A66":"#8A8170", fontWeight:600, fontSize:14, cursor:"pointer", boxShadow: activo?"0 2px 6px rgba(20,55,65,0.12)":"none"}}>
                <Icon size={15}/> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{padding:24, maxWidth:1100, margin:"0 auto"}}>

        {error && <div style={{background:"#F7E9E0", border:"1px solid #D9A678", color:"#A8542C", padding:"10px 14px", borderRadius:10, marginBottom:16, fontSize:14}}>{error}</div>}
        {aviso && <div style={{background:"#E3EAF2", border:"1px solid #A9C0DA", color:"#3D5A80", padding:"10px 14px", borderRadius:10, marginBottom:16, fontSize:14}}>{aviso}</div>}

        {/* Leyenda */}
        <div style={{display:"flex", gap:16, marginBottom:18, flexWrap:"wrap"}}>
          {Object.entries(TIPOS).map(([k,t]) => (
            <div key={k} style={{display:"flex", alignItems:"center", gap:6, fontSize:13, color:"#5C5448"}}>
              <span style={{width:10, height:10, borderRadius:2, background:t.color, display:"inline-block"}}/>
              {t.label}
            </div>
          ))}
        </div>

        {cargando ? (
          <div style={{textAlign:"center", padding:60, color:"#8A8170"}}>Cargando…</div>
        ) : vista === "calendario" ? (
          /* ── VISTA CALENDARIO ── */
          <div style={{background:"#fff", borderRadius:18, padding:22, boxShadow:"0 2px 16px -4px rgba(20,55,65,0.10)"}}>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16}}>
              <button onClick={mesAnterior} style={{border:"none", background:"#EEF3F2", borderRadius:10, padding:"7px 14px", cursor:"pointer", fontSize:17, color:"#1C5A66", fontWeight:700}}>‹</button>
              <div style={{fontFamily:"Georgia,serif", fontSize:19, fontWeight:700, color:"#2B2620"}}>{MESES[mesActual]} {anioActual}</div>
              <button onClick={mesSiguiente} style={{border:"none", background:"#EEF3F2", borderRadius:10, padding:"7px 14px", cursor:"pointer", fontSize:17, color:"#1C5A66", fontWeight:700}}>›</button>
            </div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:6}}>
              {DIAS_SEMANA.map(d => <div key={d} style={{textAlign:"center", fontSize:12, color:"#A39A89", fontWeight:700}}>{d}</div>)}
            </div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4}}>
              {diasDelMes.map((c, i) => (
                <div key={i} style={{minHeight:78, border: c?"1px solid #F0ECE0":"none", borderRadius:10, padding:5, background: c?"#FCFAF5":"transparent"}}>
                  {c && (
                    <>
                      <div style={{fontSize:12, color:"#8A8170", marginBottom:3}}>{c.d}</div>
                      {c.eventos.slice(0,3).map(ev => {
                        const t = TIPOS[ev.tipo];
                        const esCompartida = !!CUENTAS_COMPARTIDAS[ev.nombre.trim().toLowerCase()];
                        return (
                          <div key={ev.id} title={`${ev.nombre}${ev.quien?" ("+ev.quien+")":""} — ${t.label}`}
                            style={esCompartida
                              ? {fontSize:10.5, background:"transparent", color:"#5C5448", border:"1px solid #D9D2C4", borderRadius:5, padding:"2px 4px", marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}
                              : {fontSize:10.5, background:t.bg, color:t.color, borderRadius:5, padding:"2px 4px", marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
                            {esCompartida ? (ev.quien||ev.nombre) : ev.nombre.split(" ")[0]}
                          </div>
                        );
                      })}
                      {c.eventos.length > 3 && <div style={{fontSize:10, color:"#A39A89"}}>+{c.eventos.length-3} más</div>}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── VISTA GRILLA ── */
          <div style={{background:"#fff", borderRadius:18, padding:22, overflowX:"auto", boxShadow:"0 2px 16px -4px rgba(20,55,65,0.10)"}}>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, minWidth:560}}>
              <button onClick={mesAnterior} style={{border:"none", background:"#EEF3F2", borderRadius:10, padding:"7px 14px", cursor:"pointer", fontSize:17, color:"#1C5A66", fontWeight:700}}>‹</button>
              <div style={{fontFamily:"Georgia,serif", fontSize:19, fontWeight:700, color:"#2B2620"}}>{MESES[mesActual]} {anioActual}</div>
              <button onClick={mesSiguiente} style={{border:"none", background:"#EEF3F2", borderRadius:10, padding:"7px 14px", cursor:"pointer", fontSize:17, color:"#1C5A66", fontWeight:700}}>›</button>
            </div>

            {personas.length === 0 ? (
              <div style={{textAlign:"center", padding:50, color:"#A39A89"}}>Todavía no hay licencias. Usá "Pedir licencia" para crear la primera.</div>
            ) : (
              <div style={{minWidth: 90 + daysInMonth(anioActual, mesActual) * 26}}>
                {/* Encabezado días */}
                <div style={{display:"flex"}}>
                  <div style={{width:90, flexShrink:0}}/>
                  {Array.from({length: daysInMonth(anioActual, mesActual)}, (_, i) => i+1).map(d => {
                    const dateStr = `${anioActual}-${String(mesActual+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                    const esHoy = dateStr === hoy.toISOString().slice(0,10);
                    const letraDia = DIAS_SEMANA[(new Date(anioActual, mesActual, d).getDay()+6)%7];
                    return (
                      <div key={d} style={{width:26, flexShrink:0, textAlign:"center", fontSize:10.5, color: esHoy?"#1C5A66":"#A39A89", fontWeight: esHoy?800:600, paddingBottom:4, borderBottom: esHoy?"2px solid #1C5A66":"2px solid transparent"}}>
                        <div style={{fontSize:9, opacity:0.75}}>{letraDia}</div>
                        {d}
                      </div>
                    );
                  })}
                </div>

                {/* Filas por persona — excluye cuentas compartidas */}
                {personas.filter(p => !CUENTAS_COMPARTIDAS[p.trim().toLowerCase()]).map(persona => (
                  <div key={persona} style={{display:"flex", alignItems:"center", borderTop:"1px solid #EFEBDE"}}>
                    <div style={{width:90, flexShrink:0, fontSize:12.5, color:"#2B2620", fontWeight:600, padding:"7px 8px 7px 0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{persona}</div>
                    {Array.from({length: daysInMonth(anioActual, mesActual)}, (_, i) => i+1).map(d => {
                      const dateStr = `${anioActual}-${String(mesActual+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                      const ev = solicitudes.find(s => s.nombre === persona && s.estado !== "rechazada" && dateRange(s.desde, s.hasta).includes(dateStr));
                      const t = ev ? TIPOS[ev.tipo] : null;
                      return (
                        <div key={d} title={ev ? `${t.label}` : ""}
                          style={{width:24, height:24, flexShrink:0, margin:"3px 1px", borderRadius:6, background: t ? t.color : "transparent", opacity: 1, border:"1px solid #F0ECE3"}}/>
                      );
                    })}
                  </div>
                ))}

                {/* Fila fija de karp/suarez — siempre al final, celdas en blanco */}
                {Object.keys(CUENTAS_COMPARTIDAS).map(cuenta => (
                  <div key={cuenta} style={{display:"flex", alignItems:"center", borderTop:"1px solid #EFEBDE"}}>
                    <div style={{width:90, flexShrink:0, fontSize:12.5, color:"#2B2620", fontWeight:600, padding:"7px 8px 7px 0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{cuenta}</div>
                    {Array.from({length: daysInMonth(anioActual, mesActual)}, (_, i) => i+1).map(d => (
                      <div key={d} style={{width:24, height:24, flexShrink:0, margin:"3px 1px", borderRadius:6, background:"transparent", border:"1px solid #F0ECE3"}}/>
                    ))}
                  </div>
                ))}

                {/* Fila TOTAL */}
                <div style={{display:"flex", alignItems:"center", borderTop:"2px solid #D4CEC0", marginTop:2}}>
                  <div style={{width:90, flexShrink:0, fontSize:11.5, color:"#8A8170", fontWeight:700, padding:"7px 8px 7px 0"}}>TOTAL</div>
                  {Array.from({length: daysInMonth(anioActual, mesActual)}, (_, i) => i+1).map(d => {
                    const dateStr = `${anioActual}-${String(mesActual+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                    const count = solicitudes.filter(s => s.estado !== "rechazada" && !CUENTAS_COMPARTIDAS[s.nombre.trim().toLowerCase()] && dateRange(s.desde, s.hasta).includes(dateStr)).length;
                    const superado = count > 4;
                    return (
                      <div key={d} style={{width:24, height:24, flexShrink:0, margin:"3px 1px", borderRadius:6, background: superado?"#C4622D":"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color: superado?"#fff": count>0?"#2B2620":"transparent"}}>
                        {count > 0 ? count : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Solicitudes del mes */}
            {(() => {
              const sols = solicitudes.filter(s => dateRange(s.desde, s.hasta).some(d => d.startsWith(claveMesActual))).sort((a,b) => a.nombre.localeCompare(b.nombre));
              if (sols.length === 0) return null;
              return (
                <div style={{marginTop:24, paddingTop:16, borderTop:"1px solid #EFEBDE", minWidth:560}}>
                  <div style={{fontSize:13, fontWeight:700, color:"#8A8170", textTransform:"uppercase", letterSpacing:0.3, marginBottom:10}}>Solicitudes de {MESES[mesActual]} {anioActual}</div>
                  <div style={{display:"flex", flexDirection:"column", gap:6}}>
                    {sols.map(s => {
                      const t = TIPOS[s.tipo];
                      return (
                        <div key={s.id} style={{display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:"#F6F3EC", borderRadius:10, fontSize:13}}>
                          <span style={{width:9, height:9, borderRadius:2, background:t.color, flexShrink:0}}/>
                          <span style={{fontWeight:600, color:"#2B2620"}}>{s.nombre}</span>
                          <span style={{color:"#8A8170"}}>{s.quien?`${s.quien} · `:""}{t.label} · {fmt(s.desde)} a {fmt(s.hasta)}</span>
                          <span style={{color:"#B0BAB9", fontSize:11.5, marginLeft:"auto", whiteSpace:"nowrap"}}>{s.creada ? fmt(new Date(s.creada).toISOString()) : "—"}</span>
                          {!esSoloLectura && s.nombre === nombre && (
                            <button onClick={() => eliminarSolicitud(s.id)} title="Eliminar" style={iconBtn("#8A8170")}><Trash2 size={13}/></button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Resumen del mes */}
            <div style={{marginTop:24, paddingTop:16, borderTop:"1px solid #EFEBDE", minWidth:560}}>
              <div style={{fontSize:13, fontWeight:700, color:"#8A8170", textTransform:"uppercase", letterSpacing:0.3, marginBottom:10}}>Resumen de {MESES[mesActual]} {anioActual}</div>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:13.5}}>
                <thead>
                  <tr style={{background:"#F4F1EC", textAlign:"left"}}>
                    <th style={th}>Nombre</th>
                    <th style={th}>Días en {MESES[mesActual]}</th>
                    <th style={th}>Días en {anioActual}</th>
                    <th style={th}>Días acumulados</th>
                  </tr>
                </thead>
                <tbody>
                  {todosLosUsuarios.map(persona => {
                    const parejaDePersona = CUENTAS_COMPARTIDAS[persona.trim().toLowerCase()] || null;
                    const activasPersona = solicitudes.filter(s => s.nombre.trim().toLowerCase() === persona.trim().toLowerCase() && s.estado !== "rechazada");
                    const diasMes = activasPersona.flatMap(s => dateRange(s.desde, s.hasta)).filter(d => d.startsWith(claveMesActual)).length;
                    const limiteAnio = `${anioActual}-${String(mesActual+1).padStart(2,"0")}-31`;
                    const diasAnio = activasPersona.flatMap(s => dateRange(s.desde, s.hasta)).filter(d => d.startsWith(String(anioActual)) && d <= limiteAnio).length;

                    if (parejaDePersona) {
                      const tramos = solicitudes
                        .filter(s => s.nombre.trim().toLowerCase() === persona.trim().toLowerCase() && s.estado !== "rechazada" && dateRange(s.desde, s.hasta).some(d => d.startsWith(claveMesActual)))
                        .sort((a,b) => a.desde < b.desde ? -1 : 1);
                      return (
                        <tr key={persona} style={{borderTop:"1px solid #EFEBDE"}}>
                          <td style={{...td, fontWeight:600}}>{persona}</td>
                          <td style={td} colSpan={3}>{tramos.length > 0 ? tramos.map(s => `${s.quien||"?"}: ${fmt(s.desde)} a ${fmt(s.hasta)}`).join(" · ") : "Sin tramos este mes"}</td>
                        </tr>
                      );
                    }
                    const acum = diasAcumulados(persona, solicitudes, anioActual, mesActual+1);
                    return (
                      <tr key={persona} style={{borderTop:"1px solid #EFEBDE"}}>
                        <td style={{...td, fontWeight:600}}>{persona}</td>
                        <td style={td}>{diasMes}</td>
                        <td style={td}>{diasAnio}</td>
                        <td style={td}><span style={acum < 0 ? {color:"#C4622D", fontWeight:700, background:"#FAE9DD", borderRadius:6, padding:"2px 8px"} : {}}>{acum}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Grilla Navidad/Año Nuevo (solo diciembre) */}
            {mesActual === 11 && (() => {
              const pNav = personas.filter(p => solicitudes.some(s => s.nombre === p && s.tipo === "navidad" && s.estado !== "rechazada" && dateRange(s.desde, s.hasta).some(d => d.startsWith(claveMesActual))));
              const pAn = personas.filter(p => solicitudes.some(s => s.nombre === p && s.tipo === "anio_nuevo" && s.estado !== "rechazada" && dateRange(s.desde, s.hasta).some(d => d.startsWith(claveMesActual))));
              const soloAn = pAn.filter(p => !pNav.includes(p)).sort();
              const todos = [...[...pNav].sort(), ...soloAn];
              if (todos.length === 0) return null;
              return (
                <div style={{marginTop:24, paddingTop:16, borderTop:"1px solid #EFEBDE", minWidth:560}}>
                  <div style={{fontSize:13, fontWeight:700, color:"#8A8170", textTransform:"uppercase", letterSpacing:0.3, marginBottom:10}}>Grilla Navidad y Año Nuevo — Diciembre {anioActual}</div>
                  <table style={{width:"100%", borderCollapse:"collapse", fontSize:13.5}}>
                    <thead>
                      <tr style={{background:"#F4F1EC", textAlign:"left"}}>
                        <th style={th}>Nombre</th>
                        <th style={th}>Navidad</th>
                        <th style={th}>Año Nuevo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todos.map(p => (
                        <tr key={p} style={{borderTop:"1px solid #EFEBDE"}}>
                          <td style={{...td, fontWeight:600}}>{p}</td>
                          <td style={td}>{pNav.includes(p) ? <span style={{color:TIPOS.navidad.color, fontWeight:700}}>✓</span> : <span style={{color:"#D9D2C4"}}>—</span>}</td>
                          <td style={td}>{pAn.includes(p) ? <span style={{color:TIPOS.anio_nuevo.color, fontWeight:700}}>✓</span> : <span style={{color:"#D9D2C4"}}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Modal cambiar contraseña */}
      {modalClaveAbierto && (
        <div style={{position:"fixed", inset:0, background:"rgba(20,35,38,0.45)", backdropFilter:"blur(2px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16, zIndex:50}} onClick={() => setModalClaveAbierto(false)}>
          <div onClick={e => e.stopPropagation()} style={{background:"#fff", borderRadius:20, padding:28, maxWidth:380, width:"100%", boxShadow:"0 30px 60px -16px rgba(20,40,45,0.35)"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20}}>
              <div style={{fontFamily:"Georgia,serif", fontSize:20, fontWeight:700, color:"#1F2A2C"}}>Cambiar contraseña</div>
              <button onClick={() => setModalClaveAbierto(false)} style={{border:"none", background:"#F1EFE7", borderRadius:9, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#8A8170"}}><X size={17}/></button>
            </div>
            <label style={lbl}>Contraseña actual</label>
            <input type="password" value={claveActualInput} onChange={e => setClaveActualInput(e.target.value)} style={{...inp, marginBottom:14}}/>
            <label style={lbl}>Contraseña nueva</label>
            <input type="password" value={claveNuevaInput} onChange={e => setClaveNuevaInput(e.target.value)} style={{...inp, marginBottom:14}}/>
            <label style={lbl}>Repetir contraseña nueva</label>
            <input type="password" value={claveNuevaInput2} onChange={e => setClaveNuevaInput2(e.target.value)} style={{...inp, marginBottom:16}}/>
            {errorClave && <div style={{background:"#FAE9DD", border:"1px solid #E8B98C", color:"#C4622D", padding:"10px 12px", borderRadius:10, marginBottom:14, fontSize:13.5}}>{errorClave}</div>}
            {avisoClave && <div style={{background:"#E2F0F2", border:"1px solid #9CC3CB", color:"#1C5A66", padding:"10px 12px", borderRadius:10, marginBottom:14, fontSize:13.5}}>{avisoClave}</div>}
            <button onClick={cambiarClave} style={{width:"100%", padding:"13px", background:"linear-gradient(135deg,#1C5A66,#2D7A8A)", color:"#fff", border:"none", borderRadius:12, fontWeight:700, fontSize:15, cursor:"pointer"}}>
              Guardar nueva contraseña
            </button>
          </div>
        </div>
      )}

      {/* Modal pedir licencia */}
      {modalAbierto && (
        <div style={{position:"fixed", inset:0, background:"rgba(20,35,38,0.45)", backdropFilter:"blur(2px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16, zIndex:50}} onClick={() => setModalAbierto(false)}>
          <div onClick={e => e.stopPropagation()} style={{background:"#fff", borderRadius:20, padding:28, maxWidth:420, width:"100%", boxShadow:"0 30px 60px -16px rgba(20,40,45,0.35)"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20}}>
              <div style={{fontFamily:"Georgia,serif", fontSize:20, fontWeight:700, color:"#1F2A2C"}}>Pedir licencia</div>
              <button onClick={() => setModalAbierto(false)} style={{border:"none", background:"#F1EFE7", borderRadius:9, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#8A8170"}}><X size={17}/></button>
            </div>

            {parejaCompartida && (
              <>
                <label style={lbl}>¿Quién pide?</label>
                <div style={{display:"flex", gap:7, marginBottom:16}}>
                  {parejaCompartida.map(q => (
                    <button key={q} onClick={() => setForm(f => ({...f, quien:q}))}
                      style={{flex:1, padding:"9px 6px", borderRadius:11, border: form.quien===q?"2px solid #1C5A66":"1.5px solid #E7E1D4", background: form.quien===q?"#E2F0F2":"#fff", color: form.quien===q?"#1C5A66":"#5C5448", fontSize:13, fontWeight:600, cursor:"pointer"}}>
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}

            <label style={lbl}>Tipo</label>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:16}}>
              {Object.entries(TIPOS).filter(([k]) => !parejaCompartida || ["mensual","navidad","anio_nuevo"].includes(k)).map(([k,t]) => (
                <button key={k} onClick={() => setForm(f => ({...f, tipo:k}))}
                  style={{padding:"9px 6px", borderRadius:11, border: form.tipo===k?`2px solid ${t.color}`:"1.5px solid #E7E1D4", background: form.tipo===k?t.bg:"#fff", color: form.tipo===k?t.color:"#5C5448", fontSize:12.5, fontWeight:600, cursor:"pointer"}}>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{display:"flex", gap:10, marginBottom:16}}>
              <div style={{flex:1}}>
                <label style={lbl}>Desde</label>
                <input type="date" value={form.desde} onChange={e => setForm(f => ({...f, desde:e.target.value}))} style={inp}/>
              </div>
              <div style={{flex:1}}>
                <label style={lbl}>Hasta</label>
                <input type="date" value={form.hasta} min={form.desde} onChange={e => setForm(f => ({...f, hasta:e.target.value}))} style={inp}/>
              </div>
            </div>

            {error && <div style={{background:"#FAE9DD", border:"1px solid #E8B98C", color:"#C4622D", padding:"10px 12px", borderRadius:10, marginBottom:16, fontSize:13.5}}>{error}</div>}

            <button onClick={crearSolicitud} disabled={!form.desde || !form.hasta || enviando}
              style={{width:"100%", padding:"13px", background:(form.desde&&form.hasta&&!enviando)?"linear-gradient(135deg,#1C5A66,#2D7A8A)":"#D7DEDD", color:"#fff", border:"none", borderRadius:12, fontWeight:700, fontSize:15, cursor:(form.desde&&form.hasta&&!enviando)?"pointer":"default"}}>
              {enviando ? "Enviando…" : "Enviar solicitud"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
