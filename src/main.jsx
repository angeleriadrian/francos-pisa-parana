import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Versión actual de la app — debe coincidir con public/version.json
const VERSION_ACTUAL = '1.0.1';

function mostrarModalActualizacion() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(20,35,38,0.85);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:system-ui;padding:24px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:32px 28px;max-width:360px;width:100%;text-align:center;box-shadow:0 30px 60px rgba(0,0,0,0.4)">
      <div style="font-size:40px;margin-bottom:16px">🔄</div>
      <div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#1F2A2C;margin-bottom:10px">Nueva versión disponible</div>
      <p style="font-size:14px;color:#5C5448;line-height:1.5;margin-bottom:24px">Hay una actualización de <strong>Francos PISA Paraná</strong>. Tocá el botón para aplicarla y continuar.</p>
      <button onclick="window.location.reload(true)" style="width:100%;padding:14px;background:linear-gradient(135deg,#1C5A66,#2D7A8A);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 8px 18px -6px rgba(28,90,102,0.5)">
        Actualizar ahora
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function chequearVersion() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`); // t= evita caché
    const data = await res.json();
    if (data.version !== VERSION_ACTUAL) {
      mostrarModalActualizacion();
    }
  } catch (e) {
    // Si falla el chequeo, no bloqueamos — dejamos entrar igual
  }
}

// Chequeamos versión al abrir y cada 5 minutos
chequearVersion();
setInterval(chequearVersion, 5 * 60 * 1000);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

