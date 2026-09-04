import { motion } from 'framer-motion';
import { GridBackground, NoiseOverlay, TypeReveal, springBouncy, springSnappy } from '../shared';
import { Rocket } from 'lucide-react';

export function Scene5() {
  return (
    <motion.div
      className="absolute inset-0 bg-[#07111d] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0, y: '100vh' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <GridBackground opacity={0.4} />
      <NoiseOverlay />

      {/* Massive subtle background burst */}
      <motion.div
        className="absolute w-[80vw] h-[80vw] rounded-full bg-[#16d9f5] mix-blend-screen"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.08 }}
        transition={{ duration: 2, ease: "easeOut" }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...springBouncy, delay: 0.4 }}
          className="w-24 h-24 rounded-2xl bg-[#16d9f5]/10 border border-[#16d9f5]/30 flex items-center justify-center mb-8"
        >
          <Rocket className="w-12 h-12 text-[#16d9f5]" />
        </motion.div>

        <TypeReveal 
          text="Terbitkan Solusi Siap Pakai." 
          className="text-[4.5vw] font-display font-extrabold text-[#edf7ff] tracking-tight text-center"
          delay={0.6}
        />
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 text-[1.8vw] text-[#91a9bd] font-medium text-center max-w-[50vw]"
        >
          Hasil akhirnya adalah customer journey yang stabil, scalable, dan siap digunakan.
        </motion.p>
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ ...springSnappy, delay: 2.5 }}
          className="mt-12"
        >
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="PST Factory" className="h-[4vw]" />
        </motion.div>
      </div>
    </motion.div>
  );
}