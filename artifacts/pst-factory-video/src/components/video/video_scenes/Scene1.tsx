import { motion } from 'framer-motion';
import { GridBackground, NoiseOverlay, TypeReveal, springSnappy } from '../shared';
import { Target } from 'lucide-react';

export function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 bg-[#07111d] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <GridBackground />
      <NoiseOverlay />
      
      {/* Background drifting shapes */}
      <motion.div 
        className="absolute w-[40vw] h-[40vw] rounded-full bg-[#16d9f5] opacity-5 blur-[100px]"
        initial={{ x: '-20vw', y: '20vh' }}
        animate={{ x: '10vw', y: '-10vh' }}
        transition={{ duration: 4, ease: "linear" }}
      />
      <motion.div 
        className="absolute w-[30vw] h-[30vw] rounded-full bg-[#f7aa3b] opacity-[0.03] blur-[80px]"
        initial={{ x: '20vw', y: '-20vh' }}
        animate={{ x: '-10vw', y: '10vh' }}
        transition={{ duration: 4, ease: "linear" }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ scale: 0, opacity: 0, rotate: -45 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0, opacity: 0, rotate: 45 }}
          transition={{ ...springSnappy, delay: 0.2 }}
          className="w-24 h-24 rounded-2xl bg-[#16d9f5]/10 border border-[#16d9f5]/30 flex items-center justify-center mb-8"
        >
          <Target className="w-12 h-12 text-[#16d9f5]" />
        </motion.div>
        
        <TypeReveal 
          text="Dari Masalah Kompleks..." 
          className="text-[4vw] font-display font-extrabold text-[#edf7ff] tracking-tight text-center"
          delay={0.5}
        />
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.8, delay: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 text-[1.5vw] text-[#91a9bd] font-medium text-center max-w-[60vw]"
        >
          Mengidentifikasi kebutuhan pengguna dan merumuskan titik awal yang jelas.
        </motion.p>
      </div>

      {/* Floating chaotic dots representing problems */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-[#91a9bd]"
          initial={{ 
            x: `${Math.random() * 100}vw`, 
            y: `${Math.random() * 100}vh`,
            opacity: 0,
            scale: 0
          }}
          animate={{ 
            x: `${Math.random() * 100}vw`, 
            y: `${Math.random() * 100}vh`,
            opacity: [0, 0.5, 0],
            scale: [0, 1, 0]
          }}
          transition={{ 
            duration: 2 + Math.random() * 2, 
            delay: Math.random() * 1,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      ))}
    </motion.div>
  );
}