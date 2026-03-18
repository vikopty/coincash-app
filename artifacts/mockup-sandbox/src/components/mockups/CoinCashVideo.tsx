import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Search, Lock, AlertTriangle, CheckCircle, Smartphone } from 'lucide-react';

const SCENE_DURATIONS = [4000, 5000, 6000, 5000, 5000, 4000];
const TOTAL_SCENES = SCENE_DURATIONS.length;

const easeOutQuart = [0.25, 1, 0.5, 1];

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
    <div className="w-full h-screen bg-black flex items-center justify-center overflow-hidden">
      {/* 9:16 Canvas for Instagram Reel */}
      <div className="relative w-full max-w-[56.25vh] h-full sm:h-screen sm:aspect-[9/16] bg-[#0B0F14] text-[#E5E7EB] font-sans overflow-hidden shadow-2xl">
        
        {/* PERSISTENT BACKGROUND */}
        <div className="absolute inset-0 z-0 opacity-30">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#00FFC6]/10 via-[#0B0F14] to-[#0B0F14] z-0" />
          <div className="absolute inset-0 opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
        </div>

        {/* Global persistent drifting shapes */}
        <motion.div
          className="absolute w-[150%] h-[150%] rounded-full blur-[100px] pointer-events-none z-0"
          animate={{
            background: 
              currentScene === 2 ? 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, rgba(11,15,20,0) 60%)' :
              currentScene === 4 ? 'radial-gradient(circle, rgba(0,255,198,0.2) 0%, rgba(11,15,20,0) 60%)' :
              'radial-gradient(circle, rgba(0,255,198,0.12) 0%, rgba(11,15,20,0) 60%)',
            x: currentScene % 2 === 0 ? '10%' : '-10%',
            y: currentScene % 3 === 0 ? '5%' : '-15%',
            scale: currentScene === 2 ? 1.3 : 1,
          }}
          transition={{ duration: 4, ease: 'easeInOut' }}
        />

        {/* FOREGROUND SCENES */}
        <div className="relative z-10 w-full h-full flex flex-col">
          <AnimatePresence mode="wait">
            {currentScene === 0 && <Scene1 key="s1" />}
            {currentScene === 1 && <Scene2 key="s2" />}
            {currentScene === 2 && <Scene3 key="s3" />}
            {currentScene === 3 && <Scene4 key="s4" />}
            {currentScene === 4 && <Scene5 key="s5" />}
            {currentScene === 5 && <Scene6 key="s6" />}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// SCENE 1: Hook
function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: easeOutQuart }}
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0, rotateX: 90 }}
        animate={{ scale: 1, opacity: 1, rotateX: 0 }}
        transition={{ delay: 0.2, duration: 1, type: "spring", bounce: 0.4 }}
        className="mb-12 relative"
      >
        <div className="absolute inset-0 bg-[#00FFC6] blur-[50px] opacity-20 rounded-full" />
        <Shield className="w-32 h-32 text-[#00FFC6] relative z-10 drop-shadow-[0_0_20px_rgba(0,255,198,0.5)]" />
      </motion.div>
      
      <motion.div className="text-center" initial="hidden" animate="visible" variants={{
        visible: { transition: { staggerChildren: 0.2 } }
      }}>
        <motion.h1 
          className="text-4xl font-black text-white tracking-tight leading-tight mb-4"
          variants={{
            hidden: { y: 40, opacity: 0 },
            visible: { y: 0, opacity: 1, transition: { duration: 0.8, ease: easeOutQuart } }
          }}
        >
          Tus fondos en TRON...
        </motion.h1>
        <motion.h2 
          className="text-5xl font-black text-[#00FFC6] leading-tight"
          style={{ textShadow: '0 0 30px rgba(0,255,198,0.4)' }}
          variants={{
            hidden: { y: 20, opacity: 0 },
            visible: { y: 0, opacity: 1, transition: { duration: 0.8, ease: easeOutQuart } }
          }}
        >
          ¿Están seguros?
        </motion.h2>
      </motion.div>
    </motion.div>
  );
}

// SCENE 2: The Solution / Scanner Intro
function Scene2() {
  const [typed, setTyped] = useState("");
  const fullAddress = "TJw...9XqZ";

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i <= fullAddress.length) {
        setTyped(fullAddress.substring(0, i));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-8"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: easeOutQuart }}
    >
      <motion.h2 
        className="text-3xl font-bold text-center mb-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.8 }}
      >
        Analiza cualquier <br/>
        <span className="text-[#00FFC6]">billetera en segundos</span>
      </motion.h2>
      
      <motion.div 
        className="bg-[#0B1220] border border-[#1E2736] rounded-3xl p-8 w-full max-w-sm shadow-[0_0_50px_rgba(0,255,198,0.1)] relative overflow-hidden"
        initial={{ opacity: 0, scale: 0.8, rotateY: 20 }}
        animate={{ opacity: 1, scale: 1, rotateY: 0 }}
        transition={{ delay: 0.4, duration: 1, type: "spring", bounce: 0.4 }}
        style={{ perspective: 1000 }}
      >
        <div className="flex items-center space-x-4 mb-8 pb-6 border-b border-[#1E2736]">
          <Search className="w-8 h-8 text-[#00FFC6]" />
          <span className="text-xl font-medium text-gray-300">Auditoría TRON</span>
        </div>
        
        <div className="bg-[#0B0F14] rounded-xl p-4 mb-6 border border-[#1E2736] flex items-center justify-between">
          <span className="text-2xl font-mono text-[#E5E7EB]">
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
          className="mt-6 text-center text-sm text-[#00FFC6] font-medium"
          initial={{ opacity: 0 }}
          animate={{ opacity: typed.length === fullAddress.length ? 1 : 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          Escaneando blockchain...
        </motion.div>

        {/* Scanner beam */}
        <motion.div
          className="absolute left-0 right-0 h-24 bg-gradient-to-b from-transparent via-[rgba(0,255,198,0.2)] to-transparent"
          initial={{ top: '-30%' }}
          animate={{ top: typed.length === fullAddress.length ? '130%' : '-30%' }}
          transition={{ delay: 0.5, duration: 1.5, ease: "linear", repeat: Infinity }}
        />
      </motion.div>
    </motion.div>
  );
}

// SCENE 3: Risk Results
function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-6"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: easeOutQuart }}
    >
      <motion.h2 
        className="text-4xl font-bold text-center mb-10 leading-tight"
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        Detecta <span className="text-red-500">fraude</span><br/>antes de operar
      </motion.h2>

      <div className="w-full space-y-6">
        {/* Red Alert Card */}
        <motion.div 
          className="bg-[#0B1220] border border-red-500/30 rounded-3xl p-6 relative overflow-hidden"
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8, type: "spring", bounce: 0.4 }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 blur-[40px] rounded-full" />
          
          <div className="flex items-center space-x-4 mb-6">
            <div className="p-3 bg-red-500/20 rounded-full">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-xl font-black text-red-500 tracking-wide">RIESGO ALTO</h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-red-500/10 rounded-xl border border-red-500/20">
              <span className="text-gray-300 text-sm">Reportes</span>
              <span className="text-red-400 font-bold">4 Detecciones</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-red-500/10 rounded-xl border border-red-500/20">
              <span className="text-gray-300 text-sm">Fondos Ilícitos</span>
              <span className="text-red-400 font-bold">98% Prob.</span>
            </div>
          </div>
        </motion.div>

        {/* Green Safe Card */}
        <motion.div 
          className="bg-[#0B1220] border border-[#00FFC6]/30 rounded-3xl p-6 relative overflow-hidden"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.8, type: "spring", bounce: 0.4 }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#00FFC6]/10 blur-[40px] rounded-full" />
          
          <div className="flex items-center space-x-4 mb-6">
            <div className="p-3 bg-[#00FFC6]/20 rounded-full">
              <CheckCircle className="w-6 h-6 text-[#00FFC6]" />
            </div>
            <h3 className="text-xl font-black text-[#00FFC6] tracking-wide">BILLETERA SEGURA</h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-[#00FFC6]/10 rounded-xl border border-[#00FFC6]/20">
              <span className="text-gray-300 text-sm">Historial</span>
              <span className="text-[#00FFC6] font-bold">Limpio</span>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// SCENE 4: Chat Intro
function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
      initial={{ opacity: 0, scale: 1.2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)' }}
      transition={{ duration: 1, ease: easeOutQuart }}
    >
      <motion.div 
        className="w-40 h-40 rounded-full bg-[#0B1220] border-[3px] border-[#00FFC6] flex items-center justify-center mb-10 relative"
        style={{ boxShadow: '0 0 60px rgba(0,255,198,0.2)' }}
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.2, duration: 1, type: "spring", stiffness: 150 }}
      >
        <Lock className="w-20 h-20 text-[#00FFC6]" />
        
        {/* Orbiting particles */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute w-4 h-4 bg-[#00FFC6] rounded-full blur-[2px]"
            animate={{ rotate: 360 }}
            transition={{
              rotate: { duration: 3, ease: "linear", repeat: Infinity, delay: i * 1 },
            }}
            style={{ originX: '5rem', originY: '5rem', left: '-2.5rem', top: '-2.5rem' }}
          />
        ))}
      </motion.div>

      <motion.h2 
        className="text-4xl font-black text-white mb-4 leading-tight"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.8 }}
      >
        Chat Privado
      </motion.h2>
      <motion.h2 
        className="text-5xl font-black text-[#00FFC6] leading-none"
        style={{ textShadow: '0 0 30px rgba(0,255,198,0.4)' }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.8 }}
      >
        E2E Cifrado
      </motion.h2>
      
      <motion.p
        className="text-xl text-gray-400 mt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
      >
        Soporte 100% anónimo.<br/>Nadie más puede leer.
      </motion.p>
    </motion.div>
  );
}

// SCENE 5: Chat UI
function Scene5() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center p-6"
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-100%' }}
      transition={{ duration: 0.8, ease: easeOutQuart }}
    >
      <div className="relative w-full max-w-sm h-[60vh] bg-[#0B1220] border border-[#1E2736] rounded-[2.5rem] shadow-2xl p-6 flex flex-col justify-end overflow-hidden">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 bg-[#1E2736]/80 backdrop-blur-xl p-4 flex items-center space-x-4 border-b border-[#1E2736] z-10">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00FFC6] to-blue-500 flex items-center justify-center text-black font-bold text-lg">CC</div>
          <div>
            <div className="font-bold text-white text-lg">Soporte CC</div>
            <div className="text-xs text-[#00FFC6] flex items-center mt-1"><Lock className="w-3 h-3 mr-1" /> Cifrado activo</div>
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-6 mt-20 relative z-0">
          <motion.div 
            className="self-start max-w-[85%] bg-[#1E2736] text-white p-4 rounded-2xl rounded-tl-sm shadow-lg"
            initial={{ opacity: 0, x: -50, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: 0.6, type: 'spring', bounce: 0.4 }}
          >
            <span className="text-base">Necesito verificar una transacción urgente.</span>
          </motion.div>

          <div className="flex justify-end">
            <motion.div 
              className="max-w-[85%] bg-[#00FFC6] text-black p-4 rounded-2xl rounded-tr-sm font-medium shadow-lg relative overflow-hidden"
              initial={{ opacity: 0, x: 50, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ delay: 1.6, type: 'spring', bounce: 0.4 }}
            >
              <span className="text-base relative z-10">Pásame la dirección, la reviso por nuestra red segura.</span>
              
              {/* Encryption scramble effect */}
              <motion.div 
                className="absolute inset-0 bg-black flex items-center justify-center text-[#00FFC6] font-mono text-xs break-all p-2 z-20"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ delay: 2.2, duration: 0.6 }}
              >
                0x8F92A3B4...E41C9
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// SCENE 6: Outro / CTA
function Scene6() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#0B0F14] to-[#0A1929] px-8"
      initial={{ opacity: 0, scale: 1.2 }}
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
        <Smartphone className="w-32 h-32 text-white relative z-10 drop-shadow-2xl" />
        <Shield className="w-16 h-16 text-[#00FFC6] absolute -bottom-4 -right-4 z-20 drop-shadow-[0_0_15px_rgba(0,255,198,1)]" />
      </motion.div>

      <motion.h1 
        className="text-5xl font-black text-white tracking-tight mt-12 mb-4 text-center leading-tight"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.8 }}
      >
        Protege tu <br/>
        <span className="text-[#00FFC6] drop-shadow-[0_0_20px_rgba(0,255,198,0.3)]">crypto hoy</span>
      </motion.h1>

      <motion.h2
        className="text-2xl text-gray-400 font-bold mt-2"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.8 }}
      >
        CoinCash Scanner
      </motion.h2>

      <motion.div
        className="mt-12 w-full"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1.2, type: "spring", bounce: 0.6 }}
      >
        <div className="bg-[#00FFC6] text-black font-black text-xl py-5 px-8 rounded-full text-center shadow-[0_0_30px_rgba(0,255,198,0.4)] uppercase tracking-wider">
          Descarga Gratis
        </div>
      </motion.div>
    </motion.div>
  );
}
