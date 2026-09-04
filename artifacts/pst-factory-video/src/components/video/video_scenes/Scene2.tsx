import { motion } from 'framer-motion';
import { GridBackground, NoiseOverlay, TypeReveal, springBouncy } from '../shared';
import { FileCode2 } from 'lucide-react';

export function Scene2() {
  return (
    <motion.div
      className="absolute inset-0 bg-[#07111d] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ opacity: 1, clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <GridBackground opacity={0.3} />
      <NoiseOverlay />

      <div className="absolute inset-0 flex items-center justify-center opacity-20 perspective-container">
        <motion.div 
          className="w-[60vw] h-[40vw] border border-[#16d9f5] grid grid-cols-4 grid-rows-3 gap-4 p-4"
          initial={{ rotateX: 60, rotateZ: -45, scale: 1.5, y: '20vh' }}
          animate={{ rotateX: 0, rotateZ: 0, scale: 1, y: 0 }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {[...Array(12)].map((_, i) => (
            <motion.div 
              key={i} 
              className="bg-[#16d9f5]/20 border border-[#16d9f5]/50 rounded-lg"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5 + i * 0.05, ...springBouncy }}
            />
          ))}
        </motion.div>
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="w-24 h-24 rounded-2xl bg-[#f7aa3b]/10 border border-[#f7aa3b]/30 flex items-center justify-center mb-8"
        >
          <FileCode2 className="w-12 h-12 text-[#f7aa3b]" />
        </motion.div>

        <TypeReveal 
          text="...Menjadi Rancangan Terstruktur" 
          className="text-[4vw] font-display font-extrabold text-[#edf7ff] tracking-tight text-center"
          delay={0.6}
        />
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.8, delay: 1.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 text-[1.5vw] text-[#91a9bd] font-medium text-center max-w-[60vw]"
        >
          Blueprint yang presisi memastikan setiap komponen memiliki peran yang jelas.
        </motion.p>
      </div>
    </motion.div>
  );
}