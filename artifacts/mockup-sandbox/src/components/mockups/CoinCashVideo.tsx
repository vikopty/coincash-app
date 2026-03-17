import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Search, Lock, MessageSquare, AlertTriangle, CheckCircle, Zap } from 'lucide-react';

const SCENE_DURATIONS = [3500, 5500, 4500, 5500, 4500, 4500, 3500];
const TOTAL_SCENES = SCENE_DURATIONS.length;

// Easing presets
const easeOutQuart = [0.25, 1, 0.5, 1];
const easeInOutQuart = [0.76, 0, 0.24, 1];

export default function CoinCashVideo() {
  const [currentScene, setCurrentScene] = useState(0);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    let timeout: NodeJS.Timeout;
    const playScene = () => {
      timeout = setTimeout(() => {
        setCurrentScene((prev) => (prev + 1) % TOTAL_SCENES);
      }, SCENE_DURATIONS[currentScene]);
    };

    playScene();
    return () => clearTimeout(timeout);
  }, [currentScene, isClient]);

  if (!isClient) return null;

  return (
    <div className="w-full h-screen bg-[#0B0F14] text-[#E5E7EB] font-sans overflow-hidden relative flex items-center justify-center">
      {/* PERSISTENT BACKGROUND */}
      <div className="absolute inset-0 z-0 opacity-40">
        <img 
          src="/bg-tech.png" 
          alt="Tech Background" 
          className="w-full h-full object-cover opacity-60 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F14] via-transparent to-[#0B0F14]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B0F14] via-transparent to-[#0B0F14]" />
      </div>

      {/* Hex pattern persistent */}
      <div className="absolute inset-0 bg-hex opacity-50 z-0 mix-blend-screen pointer-events-none" />
      
      {/* Scanline */}
      <div className="scanline" />

      {/* Global persistent shapes for continuity */}
      <motion.div
        className="absolute w-[80vw] h-[80vw] rounded-full blur-[120px] pointer-events-none z-0"
        animate={{
          background: 
            currentScene === 0 ? 'radial-gradient(circle, rgba(0,255,198,0.15) 0%, rgba(11,15,20,0) 70%)' :
            currentScene === 2 ? 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, rgba(11,15,20,0) 70%)' :
            'radial-gradient(circle, rgba(0,255,198,0.1) 0%, rgba(11,15,20,0) 70%)',
          x: currentScene % 2 === 0 ? '10vw' : '-10vw',
          y: currentScene % 3 === 0 ? '10vh' : '-10vh',
          scale: currentScene === 1 ? 1.2 : 1,
        }}
        transition={{ duration: 3, ease: 'easeInOut' }}
      />

      {/* FOREGROUND SCENES */}
      <div className="relative z-10 w-full h-full">
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
    </div>
  );
}

// SCENE 1: Intro
function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: easeOutQuart }}
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 1, ease: easeOutQuart }}
        className="relative"
      >
        <div className="absolute inset-0 bg-[#00FFC6] blur-[60px] opacity-20 rounded-full" />
        <img src="/logo-shield.png" alt="Logo" className="w-[15vw] h-[15vw] object-contain relative z-10 drop-shadow-[0_0_30px_rgba(0,255,198,0.5)]" />
      </motion.div>
      
      <motion.div className="mt-8 text-center" initial="hidden" animate="visible" variants={{
        visible: { transition: { staggerChildren: 0.1 } }
      }}>
        <motion.h1 
          className="text-[5vw] font-display font-bold text-white tracking-tight glow-text leading-none mb-4"
          variants={{
            hidden: { y: 20, opacity: 0, rotateX: 45 },
            visible: { y: 0, opacity: 1, rotateX: 0, transition: { duration: 0.8, ease: easeOutQuart } }
          }}
        >
          CoinCash Scanner
        </motion.h1>
        <motion.p 
          className="text-[2vw] text-[#00FFC6] font-medium tracking-wide"
          variants={{
            hidden: { y: 20, opacity: 0 },
            visible: { y: 0, opacity: 1, transition: { duration: 0.8, ease: easeOutQuart } }
          }}
        >
          Protege tu billetera TRON
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

// SCENE 2: Scanner Intro
function Scene2() {
  const [typed, setTyped] = useState("");
  const fullAddress = "TXYZ12...9A4B";

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i <= fullAddress.length) {
        setTyped(fullAddress.substring(0, i));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center p-20"
      initial={{ opacity: 0, x: '10vw' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-10vw', filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: easeOutQuart }}
    >
      <div className="w-1/2 pr-10">
        <motion.h2 
          className="text-[4vw] font-display font-bold leading-tight mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          Análisis de<br/><span className="text-[#00FFC6] glow-text">Riesgo en Segundos</span>
        </motion.h2>
        <motion.p 
          className="text-[1.5vw] text-gray-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
        >
          Ingresa cualquier dirección TRON. Nuestro motor detecta billeteras en listas negras y patrones sospechosos.
        </motion.p>
      </div>
      
      <div className="w-1/2 flex justify-center">
        <motion.div 
          className="bg-[#0B1220] border border-[#1E2736] rounded-2xl p-8 w-[30vw] shadow-[0_0_50px_rgba(0,255,198,0.1)] relative overflow-hidden"
          initial={{ opacity: 0, scale: 0.8, rotateY: 20 }}
          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
          transition={{ delay: 0.4, duration: 1, ease: easeOutQuart }}
          style={{ perspective: 1000 }}
        >
          <div className="flex items-center space-x-4 mb-8 pb-6 border-b border-[#1E2736]">
            <Search className="w-8 h-8 text-[#00FFC6]" />
            <span className="text-[1.2vw] font-medium text-gray-300">Auditoría TRON</span>
          </div>
          
          <div className="bg-[#0B0F14] rounded-xl p-4 mb-6 border border-[#1E2736] flex items-center justify-between">
            <span className="text-[1.5vw] font-mono text-[#E5E7EB]">
              {typed}<span className="animate-pulse text-[#00FFC6]">_</span>
            </span>
          </div>
          
          <motion.div 
            className="w-full h-2 bg-[#1E2736] rounded-full overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: typed.length === fullAddress.length ? 1 : 0 }}
          >
            <motion.div 
              className="h-full bg-gradient-to-r from-[#00FFC6] to-[#00B8A9]"
              initial={{ width: '0%' }}
              animate={{ width: typed.length === fullAddress.length ? '100%' : '0%' }}
              transition={{ delay: 0.5, duration: 2, ease: "linear" }}
            />
          </motion.div>
          
          <motion.div 
            className="mt-6 text-center text-[1vw] text-[#00FFC6]"
            initial={{ opacity: 0 }}
            animate={{ opacity: typed.length === fullAddress.length ? 1 : 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            Analizando blockchain...
          </motion.div>

          {/* Scanner beam effect */}
          <motion.div
            className="absolute left-0 right-0 h-16 bg-gradient-to-b from-transparent via-[rgba(0,255,198,0.2)] to-transparent"
            initial={{ top: '-20%' }}
            animate={{ top: typed.length === fullAddress.length ? '120%' : '-20%' }}
            transition={{ delay: 0.5, duration: 1.5, ease: "linear", repeat: Infinity }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

// SCENE 3: Scanner Results
function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, scale: 1.2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: easeOutQuart }}
    >
      <div className="flex space-x-12 w-[80vw] justify-center">
        {/* Red Alert Card */}
        <motion.div 
          className="bg-[#0B1220] border border-red-500/30 rounded-3xl p-8 w-[35vw] relative overflow-hidden glow-danger"
          initial={{ x: -100, opacity: 0, rotateZ: -5 }}
          animate={{ x: 0, opacity: 1, rotateZ: 0 }}
          transition={{ delay: 0.2, duration: 0.8, type: "spring" }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 blur-[40px] rounded-full" />
          
          <div className="flex items-center space-x-4 mb-6">
            <div className="p-3 bg-red-500/20 rounded-full">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-[2vw] font-display font-bold text-red-500">RIESGO ALTO</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              <span className="text-gray-400 text-[1vw]">Reportes Blacklist</span>
              <span className="text-red-400 font-bold text-[1.2vw]">4 Detecciones</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              <span className="text-gray-400 text-[1vw]">Fondos Ilícitos</span>
              <span className="text-red-400 font-bold text-[1.2vw]">98% Probabilidad</span>
            </div>
            <div className="w-full h-3 bg-gray-800 rounded-full mt-6">
              <motion.div className="h-full bg-red-500 rounded-full" initial={{ width: 0 }} animate={{ width: '92%' }} transition={{ delay: 1, duration: 1 }} />
            </div>
          </div>
        </motion.div>

        {/* Green Safe Card */}
        <motion.div 
          className="bg-[#0B1220] border border-[#00FFC6]/30 rounded-3xl p-8 w-[35vw] relative overflow-hidden glow-box"
          initial={{ x: 100, opacity: 0, rotateZ: 5 }}
          animate={{ x: 0, opacity: 1, rotateZ: 0 }}
          transition={{ delay: 1.5, duration: 0.8, type: "spring" }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#00FFC6]/10 blur-[40px] rounded-full" />
          
          <div className="flex items-center space-x-4 mb-6">
            <div className="p-3 bg-[#00FFC6]/20 rounded-full">
              <CheckCircle className="w-8 h-8 text-[#00FFC6]" />
            </div>
            <h3 className="text-[2vw] font-display font-bold text-[#00FFC6]">SEGURO</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-[#00FFC6]/10 rounded-lg border border-[#00FFC6]/20">
              <span className="text-gray-400 text-[1vw]">Historial</span>
              <span className="text-[#00FFC6] font-bold text-[1.2vw]">Limpio</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-[#00FFC6]/10 rounded-lg border border-[#00FFC6]/20">
              <span className="text-gray-400 text-[1vw]">Antigüedad</span>
              <span className="text-[#00FFC6] font-bold text-[1.2vw]">&gt; 2 Años</span>
            </div>
            <div className="w-full h-3 bg-gray-800 rounded-full mt-6">
              <motion.div className="h-full bg-[#00FFC6] rounded-full" initial={{ width: 0 }} animate={{ width: '5%' }} transition={{ delay: 2.2, duration: 1 }} />
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// SCENE 4: Private Chat Intro
function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center text-center"
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -100, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: easeOutQuart }}
    >
      <motion.div 
        className="w-32 h-32 rounded-full bg-[#0B1220] border-2 border-[#00FFC6] flex items-center justify-center mb-8 relative glow-box"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.2, duration: 1, type: "spring", stiffness: 200 }}
      >
        <Lock className="w-16 h-16 text-[#00FFC6]" />
        
        {/* Orbiting particles */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute w-4 h-4 bg-[#00FFC6] rounded-full blur-[2px]"
            animate={{
              rotate: 360,
              scale: [1, 1.5, 1]
            }}
            transition={{
              rotate: { duration: 4, ease: "linear", repeat: Infinity, delay: i * (4/3) },
              scale: { duration: 2, repeat: Infinity }
            }}
            style={{ originX: '4rem', originY: '4rem', left: '-2rem', top: '-2rem' }}
          />
        ))}
      </motion.div>

      <motion.h2 
        className="text-[4vw] font-display font-bold text-white mb-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.8 }}
      >
        Mensajes Cifrados de
      </motion.h2>
      <motion.h2 
        className="text-[4vw] font-display font-bold text-[#00FFC6] glow-text leading-none"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.8 }}
      >
        Extremo a Extremo
      </motion.h2>
      
      <motion.p
        className="text-[1.5vw] text-gray-400 mt-8 max-w-[60vw]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
      >
        Comunícate de forma anónima y 100% segura. Solo tú y el destinatario tienen las llaves.
      </motion.p>
    </motion.div>
  );
}

// SCENE 5: Chat Demo
function Scene5() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center p-20"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: easeOutQuart }}
    >
      <div className="relative w-[50vw] h-[60vh] bg-[#0B1220] border border-[#1E2736] rounded-3xl shadow-2xl p-6 flex flex-col justify-end overflow-hidden">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 bg-[#1E2736]/50 backdrop-blur-md p-4 flex items-center space-x-4 border-b border-[#1E2736] z-10">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00FFC6] to-blue-500 flex items-center justify-center text-black font-bold">CC</div>
          <div>
            <div className="font-bold text-white text-[1.2vw]">ID: CC-8A9B21</div>
            <div className="text-[0.9vw] text-[#00FFC6] flex items-center"><Lock className="w-3 h-3 mr-1" /> Cifrado activo</div>
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-6 mt-20">
          <motion.div 
            className="self-start max-w-[80%] bg-[#1E2736] text-white p-4 rounded-2xl rounded-tl-sm relative"
            initial={{ opacity: 0, x: -50, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: 0.5, type: 'spring', bounce: 0.4 }}
          >
            <span className="text-[1.2vw]">¿El trato sigue en pie?</span>
          </motion.div>

          <div className="flex justify-end">
            <motion.div 
              className="max-w-[80%] bg-[#00FFC6] text-black p-4 rounded-2xl rounded-tr-sm font-medium relative overflow-hidden"
              initial={{ opacity: 0, x: 50, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ delay: 1.5, type: 'spring', bounce: 0.4 }}
            >
              <span className="text-[1.2vw] relative z-10">Sí, todo listo. Confirma la dirección TRON.</span>
              
              {/* Encryption effect over the message */}
              <motion.div 
                className="absolute inset-0 bg-black flex items-center justify-center text-[#00FFC6] font-mono text-[0.8vw] break-all p-2 z-20"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ delay: 2, duration: 0.5 }}
              >
                0x8F92A...E41C
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* Encryption key animation overlay */}
        <motion.div
          className="absolute inset-0 pointer-events-none flex items-center justify-center z-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 2.2, duration: 1.5 }}
        >
          <div className="bg-[#00FFC6]/20 p-8 rounded-full blur-[20px] absolute" />
          <Lock className="w-24 h-24 text-[#00FFC6] z-10 drop-shadow-[0_0_20px_#00FFC6]" />
        </motion.div>
      </div>
    </motion.div>
  );
}

// SCENE 6: Security Callout
function Scene6() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0F14]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="relative z-10 text-center max-w-[70vw]">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, type: "spring", bounce: 0.5 }}
          className="mb-8 flex justify-center"
        >
          <Shield className="w-24 h-24 text-[#00FFC6]" />
        </motion.div>

        <motion.h2 
          className="text-[4vw] font-display font-bold mb-6"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          Tu clave, tu privacidad.
        </motion.h2>

        <motion.div
          className="text-[2.5vw] text-red-400 font-bold"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
        >
          El servidor nunca puede leer tus mensajes.
        </motion.div>
      </div>

      {/* Code particles floating */}
      {Array.from({ length: 20 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute text-[#00FFC6]/30 font-mono text-[1vw]"
          initial={{ 
            x: `${Math.random() * 100}vw`, 
            y: `${100 + Math.random() * 20}vh`,
            opacity: 0
          }}
          animate={{ 
            y: '-20vh',
            opacity: [0, 1, 0]
          }}
          transition={{ 
            duration: 4 + Math.random() * 3, 
            delay: Math.random() * 2,
            ease: "linear",
            repeat: Infinity
          }}
        >
          {Math.random() > 0.5 ? '0101' : '1010'}
        </motion.div>
      ))}
    </motion.div>
  );
}

// SCENE 7: Outro
function Scene7() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#0B0F14] to-[#0A1929]"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1, ease: easeOutQuart }}
    >
      <motion.div
        className="relative"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 1, type: "spring" }}
      >
        <div className="absolute inset-0 bg-[#00FFC6] blur-[80px] opacity-30 rounded-full" />
        <img src="/logo-shield.png" alt="Logo" className="w-[20vw] h-[20vw] object-contain relative z-10" />
      </motion.div>

      <motion.h1 
        className="text-[6vw] font-display font-bold text-white tracking-tight mt-8 mb-4 glow-text"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.8 }}
      >
        CoinCash Scanner
      </motion.h1>

      <motion.div
        className="px-8 py-4 bg-[#1E2736] border border-[#00FFC6]/50 rounded-full mt-8"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.8, type: "spring", bounce: 0.6 }}
      >
        <span className="text-[1.5vw] font-bold text-[#00FFC6] tracking-widest uppercase">
          Instala la App Ahora
        </span>
      </motion.div>
    </motion.div>
  );
}
