import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Search, Lock, MessageSquare, AlertTriangle, CheckCircle } from 'lucide-react';

const SCENE_DURATIONS = [3500, 5500, 4500, 5500, 4500, 4500, 3500];
const TOTAL_SCENES = SCENE_DURATIONS.length;

const easeOutQuart = [0.25, 1, 0.5, 1] as const;
const easeInOutQuart = [0.76, 0, 0.24, 1] as const;

const VIDEO_CSS = `
  .cc-font-display { font-family: 'Space Grotesk', 'Inter', sans-serif; }
  .cc-glow-text { text-shadow: 0 0 20px rgba(0,255,198,0.5); }
  .cc-glow-box { box-shadow: 0 0 30px rgba(0,255,198,0.2); }
  .cc-glow-danger { box-shadow: 0 0 30px rgba(239,68,68,0.3); }
  .cc-scanline {
    background: linear-gradient(to bottom, rgba(0,255,198,0) 0%, rgba(0,255,198,0.1) 50%, rgba(0,255,198,0) 100%);
    height: 4px; width: 100%; position: absolute; top: 0; left: 0;
    animation: cc-scan 3s linear infinite; z-index: 50; opacity: 0.5; pointer-events: none;
  }
  .cc-bg-hex {
    background-image: url("data:image/svg+xml,%3Csvg width='60' height='103' viewBox='0 0 60 104' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 104L0 86.6V52L30 34.6L60 52V86.6L30 104ZM30 50L0 32.6V0L30 -17.3L60 0V32.6L30 50Z' fill='%2300ffc6' fill-opacity='0.03' fill-rule='evenodd'/%3E%3C/svg%3E");
  }
  @keyframes cc-scan { 0% { top: -10%; } 100% { top: 110%; } }
  @keyframes cc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
  .cc-cursor { animation: cc-pulse 1s step-end infinite; }
`;

export default function VideoPage() {
  const [currentScene, setCurrentScene] = useState(0);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const next = () => {
      timeout = setTimeout(() => {
        setCurrentScene((p) => (p + 1) % TOTAL_SCENES);
      }, SCENE_DURATIONS[currentScene]);
    };
    next();
    return () => clearTimeout(timeout);
  }, [currentScene]);

  const progress = ((currentScene + 1) / TOTAL_SCENES) * 100;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0B0F14', overflow: 'hidden', fontFamily: "'Inter', sans-serif" }}>
      <style>{VIDEO_CSS}</style>

      {/* Hex grid background */}
      <div className="cc-bg-hex" style={{ position: 'absolute', inset: 0, opacity: 0.5 }} />

      {/* Scanline */}
      <div className="cc-scanline" />

      {/* Ambient glow */}
      <motion.div
        style={{ position: 'absolute', width: '80vw', height: '80vw', borderRadius: '50%', filter: 'blur(120px)', pointerEvents: 'none', left: '10vw', top: '10vh' }}
        animate={{
          background:
            currentScene === 0 ? 'radial-gradient(circle, rgba(0,255,198,0.15) 0%, transparent 70%)' :
            currentScene === 2 ? 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)' :
            'radial-gradient(circle, rgba(0,255,198,0.08) 0%, transparent 70%)',
        }}
        transition={{ duration: 2, ease: 'easeInOut' }}
      />

      {/* Scenes */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '100%' }}>
        <AnimatePresence mode="wait">
          {currentScene === 0 && <Scene1 key="s1" />}
          {currentScene === 1 && <Scene2 key="s2" />}
          {currentScene === 2 && <Scene3 key="s3" />}
          {currentScene === 3 && <Scene4 key="s4" />}
          {currentScene === 4 && <Scene5 key="s5" />}
          {currentScene === 5 && <Scene6 key="s6" />}
          {currentScene === 6 && <Scene7 key="s7" />}
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.08)', zIndex: 100 }}>
        <motion.div
          style={{ height: '100%', background: 'linear-gradient(90deg, #00FFC6, #00B8A9)', transformOrigin: 'left' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Back button */}
      <button
        onClick={() => { window.location.hash = ""; }}
        style={{
          position: 'fixed', top: 16, left: 16, zIndex: 200,
          background: 'rgba(11,18,32,0.85)', border: '1px solid rgba(0,255,198,0.2)',
          borderRadius: 20, padding: '6px 14px 6px 10px',
          display: 'flex', alignItems: 'center', gap: 6,
          color: '#00FFC6', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', backdropFilter: 'blur(8px)',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>‹</span> Volver
      </button>

      {/* Scene dots */}
      <div style={{ position: 'fixed', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6, zIndex: 101 }}>
        {SCENE_DURATIONS.map((_, i) => (
          <div key={i} style={{ width: i === currentScene ? 20 : 6, height: 6, borderRadius: 3, background: i === currentScene ? '#00FFC6' : 'rgba(255,255,255,0.2)', transition: 'all 0.3s' }} />
        ))}
      </div>
    </div>
  );
}

/* ─── SCENE 1: Intro ─────────────────────────────────── */
function Scene1() {
  return (
    <motion.div
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: easeOutQuart }}
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 1 }}
        style={{ position: 'relative', marginBottom: 32 }}
      >
        <div style={{ position: 'absolute', inset: -20, background: '#00FFC6', filter: 'blur(60px)', opacity: 0.2, borderRadius: '50%' }} />
        <Shield size={80} style={{ color: '#00FFC6', filter: 'drop-shadow(0 0 30px rgba(0,255,198,0.5))', position: 'relative' }} />
      </motion.div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        style={{ textAlign: 'center' }}
      >
        <motion.h1
          className="cc-font-display cc-glow-text"
          style={{ fontSize: 'clamp(32px, 5vw, 64px)', fontWeight: 800, color: '#fff', margin: '0 0 16px', letterSpacing: '-0.02em' }}
          variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1, transition: { duration: 0.8 } } }}
        >
          CoinCash Scanner
        </motion.h1>
        <motion.p
          style={{ fontSize: 'clamp(14px, 2vw, 24px)', color: '#00FFC6', fontWeight: 500, margin: 0 }}
          variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1, transition: { duration: 0.8 } } }}
        >
          Protege tu billetera TRON
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

/* ─── SCENE 2: Scanner Intro ─────────────────────────── */
function Scene2() {
  const [typed, setTyped] = useState('');
  const fullAddress = 'TXYZ12...9A4B';

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      if (i <= fullAddress.length) { setTyped(fullAddress.slice(0, i)); i++; }
      else clearInterval(iv);
    }, 100);
    return () => clearInterval(iv);
  }, []);

  const done = typed.length === fullAddress.length;

  return (
    <motion.div
      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vw', gap: '4vw', color: '#fff' }}
      initial={{ opacity: 0, x: '10vw' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-10vw', filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <div style={{ flex: 1, maxWidth: '45%' }}>
        <motion.h2
          className="cc-font-display"
          style={{ fontSize: 'clamp(24px, 4vw, 52px)', fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          Análisis de<br /><span style={{ color: '#00FFC6' }}>Riesgo en Segundos</span>
        </motion.h2>
        <motion.p
          style={{ fontSize: 'clamp(12px, 1.5vw, 18px)', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          Ingresa cualquier dirección TRON. Nuestro motor detecta billeteras en listas negras y patrones sospechosos.
        </motion.p>
      </div>

      <motion.div
        style={{ flex: 1, maxWidth: '45%', background: '#0B1220', border: '1px solid #1E2736', borderRadius: 24, padding: '5%', boxShadow: '0 0 50px rgba(0,255,198,0.1)', position: 'relative', overflow: 'hidden' }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 1 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '8%', paddingBottom: '8%', borderBottom: '1px solid #1E2736' }}>
          <Search size={24} style={{ color: '#00FFC6' }} />
          <span style={{ fontSize: 'clamp(12px, 1.2vw, 16px)', color: 'rgba(255,255,255,0.7)' }}>Auditoría TRON</span>
        </div>
        <div style={{ background: '#0B0F14', borderRadius: 12, padding: '4% 5%', marginBottom: '6%', border: '1px solid #1E2736', fontFamily: 'monospace', fontSize: 'clamp(14px, 1.5vw, 20px)', color: '#E5E7EB' }}>
          {typed}<span className="cc-cursor" style={{ color: '#00FFC6' }}>_</span>
        </div>
        <motion.div style={{ width: '100%', height: 8, background: '#1E2736', borderRadius: 4, overflow: 'hidden' }} animate={{ opacity: done ? 1 : 0 }}>
          <motion.div style={{ height: '100%', background: 'linear-gradient(90deg, #00FFC6, #00B8A9)' }} initial={{ width: '0%' }} animate={{ width: done ? '100%' : '0%' }} transition={{ delay: 0.5, duration: 2 }} />
        </motion.div>
        <motion.div style={{ marginTop: '4%', textAlign: 'center', fontSize: 'clamp(10px, 1vw, 14px)', color: '#00FFC6' }} animate={{ opacity: done ? 1 : 0 }} transition={{ delay: 0.5 }}>
          Analizando blockchain...
        </motion.div>
        {/* Beam */}
        <motion.div style={{ position: 'absolute', left: 0, right: 0, height: '15%', background: 'linear-gradient(to bottom, transparent, rgba(0,255,198,0.15), transparent)', pointerEvents: 'none' }} initial={{ top: '-20%' }} animate={{ top: done ? '120%' : '-20%' }} transition={{ delay: 0.5, duration: 1.5, ease: 'linear', repeat: Infinity }} />
      </motion.div>
    </motion.div>
  );
}

/* ─── SCENE 3: Results ───────────────────────────────── */
function Scene3() {
  return (
    <motion.div
      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4vw', padding: '5vw' }}
      initial={{ opacity: 0, scale: 1.2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      {/* Red card */}
      <motion.div
        className="cc-glow-danger"
        style={{ flex: 1, maxWidth: '42%', background: '#0B1220', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 28, padding: '5%', position: 'relative', overflow: 'hidden' }}
        initial={{ x: -80, opacity: 0, rotate: -3 }}
        animate={{ x: 0, opacity: 1, rotate: 0 }}
        transition={{ delay: 0.2, duration: 0.8, type: 'spring' }}
      >
        <div style={{ position: 'absolute', top: 0, right: 0, width: 120, height: 120, background: 'rgba(239,68,68,0.1)', filter: 'blur(40px)', borderRadius: '50%' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '6%' }}>
          <div style={{ padding: 10, background: 'rgba(239,68,68,0.2)', borderRadius: '50%' }}>
            <AlertTriangle size={24} style={{ color: 'rgb(239,68,68)' }} />
          </div>
          <h3 className="cc-font-display" style={{ fontSize: 'clamp(16px, 2vw, 28px)', fontWeight: 800, color: 'rgb(239,68,68)', margin: 0 }}>RIESGO ALTO</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[['Reportes Blacklist', '4 Detecciones'], ['Fondos Ilícitos', '98% Probabilidad']].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(10px, 1vw, 14px)' }}>{l}</span>
              <span style={{ color: 'rgb(248,113,113)', fontWeight: 700, fontSize: 'clamp(11px, 1.2vw, 16px)' }}>{v}</span>
            </div>
          ))}
          <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden', marginTop: 8 }}>
            <motion.div style={{ height: '100%', background: 'rgb(239,68,68)', borderRadius: 5 }} initial={{ width: 0 }} animate={{ width: '92%' }} transition={{ delay: 1, duration: 1 }} />
          </div>
        </div>
      </motion.div>

      {/* Green card */}
      <motion.div
        className="cc-glow-box"
        style={{ flex: 1, maxWidth: '42%', background: '#0B1220', border: '1px solid rgba(0,255,198,0.3)', borderRadius: 28, padding: '5%', position: 'relative', overflow: 'hidden' }}
        initial={{ x: 80, opacity: 0, rotate: 3 }}
        animate={{ x: 0, opacity: 1, rotate: 0 }}
        transition={{ delay: 1.5, duration: 0.8, type: 'spring' }}
      >
        <div style={{ position: 'absolute', top: 0, right: 0, width: 120, height: 120, background: 'rgba(0,255,198,0.1)', filter: 'blur(40px)', borderRadius: '50%' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '6%' }}>
          <div style={{ padding: 10, background: 'rgba(0,255,198,0.2)', borderRadius: '50%' }}>
            <CheckCircle size={24} style={{ color: '#00FFC6' }} />
          </div>
          <h3 className="cc-font-display" style={{ fontSize: 'clamp(16px, 2vw, 28px)', fontWeight: 800, color: '#00FFC6', margin: 0 }}>SEGURO</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[['Historial', 'Limpio'], ['Antigüedad', '> 2 Años']].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(0,255,198,0.1)', borderRadius: 10, border: '1px solid rgba(0,255,198,0.2)' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(10px, 1vw, 14px)' }}>{l}</span>
              <span style={{ color: '#00FFC6', fontWeight: 700, fontSize: 'clamp(11px, 1.2vw, 16px)' }}>{v}</span>
            </div>
          ))}
          <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden', marginTop: 8 }}>
            <motion.div style={{ height: '100%', background: '#00FFC6', borderRadius: 5 }} initial={{ width: 0 }} animate={{ width: '5%' }} transition={{ delay: 2.2, duration: 1 }} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── SCENE 4: Private Chat Intro ───────────────────── */
function Scene4() {
  return (
    <motion.div
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#fff' }}
      initial={{ opacity: 0, y: 80 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -80, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <motion.div
        className="cc-glow-box"
        style={{ width: 120, height: 120, borderRadius: '50%', background: '#0B1220', border: '2px solid #00FFC6', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: 32 }}
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.2, duration: 1, type: 'spring', stiffness: 200 }}
      >
        <Lock size={56} style={{ color: '#00FFC6' }} />
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            style={{ position: 'absolute', width: 12, height: 12, background: '#00FFC6', borderRadius: '50%', filter: 'blur(2px)', top: -6, left: 54, originX: '60px', originY: '60px' } as React.CSSProperties}
            animate={{ rotate: 360, scale: [1, 1.5, 1] }}
            transition={{ rotate: { duration: 4, ease: 'linear', repeat: Infinity, delay: i * 1.33 }, scale: { duration: 2, repeat: Infinity } }}
          />
        ))}
      </motion.div>
      <motion.h2
        className="cc-font-display cc-glow-text"
        style={{ fontSize: 'clamp(24px, 4vw, 52px)', fontWeight: 800, color: '#fff', margin: '0 0 8px' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        Mensajes Cifrados de
      </motion.h2>
      <motion.h2
        className="cc-font-display cc-glow-text"
        style={{ fontSize: 'clamp(24px, 4vw, 52px)', fontWeight: 800, color: '#00FFC6', margin: 0 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        Extremo a Extremo
      </motion.h2>
      <motion.p
        style={{ fontSize: 'clamp(12px, 1.5vw, 20px)', color: 'rgba(255,255,255,0.5)', marginTop: 24, maxWidth: '60%' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        Comunícate de forma anónima y 100% segura. Solo tú y el destinatario tienen las llaves.
      </motion.p>
    </motion.div>
  );
}

/* ─── SCENE 5: Chat Demo ─────────────────────────────── */
function Scene5() {
  return (
    <motion.div
      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vw' }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <div style={{ width: 'min(50vw, 480px)', height: '65vh', background: '#0B1220', border: '1px solid #1E2736', borderRadius: 28, padding: '5%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', overflow: 'hidden', boxShadow: '0 0 60px rgba(0,0,0,0.6)' }}>
        {/* Header */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'rgba(30,39,54,0.8)', backdropFilter: 'blur(12px)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #1E2736', zIndex: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #00FFC6, #0080FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0B1220', fontWeight: 800, fontSize: 13 }}>CC</div>
          <div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: 'clamp(12px, 1.2vw, 15px)' }}>ID: CC-8A9B21</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#00FFC6', fontSize: 'clamp(10px, 0.9vw, 12px)' }}>
              <Lock size={10} /> Cifrado activo
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 80 }}>
          <motion.div
            style={{ alignSelf: 'flex-start', maxWidth: '80%', background: '#1E2736', color: '#fff', padding: '12px 16px', borderRadius: '18px 18px 18px 4px', fontSize: 'clamp(12px, 1.2vw, 15px)' }}
            initial={{ opacity: 0, x: -40, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: 0.5, type: 'spring', bounce: 0.4 }}
          >
            ¿El trato sigue en pie?
          </motion.div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <motion.div
              style={{ maxWidth: '80%', background: '#00FFC6', color: '#0B1220', padding: '12px 16px', borderRadius: '18px 18px 4px 18px', fontWeight: 600, fontSize: 'clamp(12px, 1.2vw, 15px)', position: 'relative', overflow: 'hidden' }}
              initial={{ opacity: 0, x: 40, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ delay: 1.5, type: 'spring', bounce: 0.4 }}
            >
              Sí, todo listo. Confirma la dirección TRON.
              <motion.div
                style={{ position: 'absolute', inset: 0, background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00FFC6', fontFamily: 'monospace', fontSize: 12, padding: 8 }}
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ delay: 2, duration: 0.5 }}
              >
                0x8F92A...E41C
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* Lock flash */}
        <motion.div
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 2.2, duration: 1.5 }}
        >
          <div style={{ position: 'absolute', width: 120, height: 120, background: 'rgba(0,255,198,0.2)', borderRadius: '50%', filter: 'blur(20px)' }} />
          <Lock size={80} style={{ color: '#00FFC6', filter: 'drop-shadow(0 0 20px #00FFC6)', position: 'relative' }} />
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ─── SCENE 6: Security Callout ──────────────────────── */
function Scene6() {
  return (
    <motion.div
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0B0F14' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', maxWidth: '70%' }}>
        <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8, type: 'spring', bounce: 0.5 }} style={{ marginBottom: 32, display: 'flex', justifyContent: 'center' }}>
          <Shield size={80} style={{ color: '#00FFC6', filter: 'drop-shadow(0 0 20px rgba(0,255,198,0.5))' }} />
        </motion.div>
        <motion.h2
          className="cc-font-display"
          style={{ fontSize: 'clamp(24px, 4vw, 52px)', fontWeight: 800, color: '#fff', marginBottom: 20 }}
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Tu clave, tu privacidad.
        </motion.h2>
        <motion.div
          style={{ fontSize: 'clamp(18px, 2.5vw, 36px)', color: 'rgb(248,113,113)', fontWeight: 800 }}
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          El servidor nunca puede leer tus mensajes.
        </motion.div>
      </div>

      {/* Floating binary particles */}
      {Array.from({ length: 16 }).map((_, i) => (
        <motion.div
          key={i}
          style={{ position: 'absolute', color: 'rgba(0,255,198,0.3)', fontFamily: 'monospace', fontSize: 'clamp(10px, 1vw, 14px)', left: `${(i / 16) * 100}%` }}
          initial={{ y: '110vh', opacity: 0 }}
          animate={{ y: '-20vh', opacity: [0, 1, 0] }}
          transition={{ duration: 4 + (i % 3), delay: (i % 4) * 0.5, ease: 'linear', repeat: Infinity }}
        >
          {i % 2 === 0 ? '0101' : '1010'}
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ─── SCENE 7: Outro ─────────────────────────────────── */
function Scene7() {
  return (
    <motion.div
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom, #0B0F14, #0A1929)' }}
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <motion.div
        style={{ position: 'relative', marginBottom: 24 }}
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 1, type: 'spring' }}
      >
        <div style={{ position: 'absolute', inset: -30, background: '#00FFC6', filter: 'blur(80px)', opacity: 0.25, borderRadius: '50%' }} />
        <Shield size={100} style={{ color: '#00FFC6', filter: 'drop-shadow(0 0 30px rgba(0,255,198,0.5))', position: 'relative' }} />
      </motion.div>

      <motion.h1
        className="cc-font-display cc-glow-text"
        style={{ fontSize: 'clamp(32px, 6vw, 80px)', fontWeight: 800, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.02em', textAlign: 'center' }}
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        CoinCash Scanner
      </motion.h1>

      <motion.div
        style={{ marginTop: 32, padding: '14px 32px', background: '#1E2736', border: '1px solid rgba(0,255,198,0.5)', borderRadius: 999 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.8, type: 'spring', bounce: 0.6 }}
      >
        <span className="cc-font-display" style={{ fontSize: 'clamp(12px, 1.5vw, 20px)', fontWeight: 800, color: '#00FFC6', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Instala la App Ahora
        </span>
      </motion.div>
    </motion.div>
  );
}
