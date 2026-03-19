import { useState } from "react";
import { ShieldCheck, FileText, Lock, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

const TEAL   = "#00FFC6";
const BG     = "#0B0F14";
const CARD   = "#0B1220";
const BORDER = "rgba(255,255,255,0.07)";
const MUTED  = "rgba(255,255,255,0.45)";
const TEXT   = "rgba(255,255,255,0.82)";

interface Section {
  id: string;
  icon: React.ElementType;
  title: string;
  items: { heading?: string; body: string }[];
}

const SECTIONS: Section[] = [
  {
    id: "terminos",
    icon: FileText,
    title: "Términos y Condiciones",
    items: [
      { body: "CoinCash Scanner es una herramienta de análisis basada en datos públicos de blockchain y fuentes de terceros." },
      { body: "No es un banco, exchange ni asesor financiero." },
      { body: "La información es únicamente informativa y no garantiza exactitud." },
      { body: "El usuario es responsable de sus decisiones." },
      { body: "El uso de criptomonedas implica riesgos." },
    ],
  },
  {
    id: "privacidad",
    icon: Lock,
    title: "Política de Privacidad",
    items: [
      { heading: "Datos que recopilamos", body: "Recopilamos información técnica limitada como dirección IP (de forma temporal), país aproximado y actividad de uso dentro de la aplicación (como número de scans realizados)." },
      { heading: "Finalidad", body: "Estos datos se utilizan únicamente para mejorar el rendimiento de la plataforma, prevenir abuso o uso indebido del sistema, y optimizar la experiencia del usuario." },
      { heading: "Privacidad", body: "No recopilamos datos personales sensibles. No vendemos ni compartimos información con terceros. No almacenamos información personal identificable de forma permanente." },
      { heading: "Seguridad", body: "Aplicamos medidas para proteger la información y garantizar su uso adecuado." },
    ],
  },
  {
    id: "aviso",
    icon: AlertTriangle,
    title: "Aviso Legal",
    items: [
      { body: "La información proporcionada se basa en datos públicos y fuentes externas." },
      { body: "No garantizamos exactitud ni actualidad." },
      { body: "No constituye asesoramiento financiero o legal." },
      { body: "CoinCash no determina la legalidad de ninguna wallet." },
      { body: "El usuario asume toda la responsabilidad." },
    ],
  },
];

function Accordion({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;

  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${open ? "rgba(0,255,198,0.2)" : BORDER}`,
        borderRadius: 16,
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 14,
          padding: "16px 18px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <div
          style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: open ? "rgba(0,255,198,0.12)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${open ? "rgba(0,255,198,0.25)" : BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.2s",
          }}
        >
          <Icon size={17} style={{ color: open ? TEAL : MUTED }} />
        </div>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: open ? "#fff" : TEXT }}>
          {section.title}
        </span>
        {open
          ? <ChevronUp size={16} style={{ color: TEAL, flexShrink: 0 }} />
          : <ChevronDown size={16} style={{ color: MUTED, flexShrink: 0 }} />
        }
      </button>

      {/* Body */}
      {open && (
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: "14px 18px 18px" }}>
          {section.items.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < section.items.length - 1 ? 12 : 0 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: TEAL, flexShrink: 0, marginTop: 7 }} />
              <div>
                {item.heading && (
                  <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 700, color: TEAL, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {item.heading}
                  </p>
                )}
                <p style={{ margin: 0, fontSize: 13, color: TEXT, lineHeight: 1.6 }}>{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LegalPage() {
  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#fff", fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "20px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <button
            onClick={() => { window.location.hash = ""; }}
            style={{
              background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: "6px 12px", color: TEAL,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5,
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>‹</span> Volver
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: "linear-gradient(135deg,rgba(0,255,198,0.18) 0%,rgba(0,184,169,0.08) 100%)",
            border: "1px solid rgba(0,255,198,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ShieldCheck size={22} style={{ color: TEAL }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Legal</h1>
            <p style={{ margin: 0, fontSize: 12, color: MUTED }}>CoinCash Scanner · Documentos legales</p>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12, maxWidth: 640, margin: "0 auto" }}>
        {SECTIONS.map((s) => (
          <Accordion key={s.id} section={s} />
        ))}

        {/* Footer note */}
        <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 8, lineHeight: 1.6 }}>
          Última actualización: 2026 · CoinCash Scanner
        </p>
      </div>
    </div>
  );
}
