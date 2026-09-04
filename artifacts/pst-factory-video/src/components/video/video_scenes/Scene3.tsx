import { motion } from 'framer-motion';
import { GridBackground, NoiseOverlay, TypeReveal, springSnappy } from '../shared';
import { Hammer } from 'lucide-react';

export function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 bg-[#07111d] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0, x: '100vw' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-100vw' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <GridBackground opacity={0.2} />
      <NoiseOverlay />

      {/* Assembly line scanning effect */}
      <motion.div
        className="absolute left-0 top-0 w-2 h-full bg-[#16d9f5] shadow-[0_0_30px_#16d9f5]"
        initial={{ x: '-10vw' }}
        animate={{ x: '110vw' }}
        transition={{ duration: 2.5, ease: 'linear', repeat: Infinity }}
      />

      <div className="absolute inset-0 flex items-center justify-between px-[15vw] opacity-10">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="w-[15vw] h-[30vw] border-2 border-dashed border-[#16d9f5] rounded-xl"
            initial={{ scaleY: 0, originY: 1 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.2 + i * 0.2, duration: 1, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ scale: 0, rotate: 180 }}
          animate={{ scale: 1, rotate: 0 }}
          exit={{ scale: 0, rotate: -180 }}
          transition={{ ...springSnappy, delay: 0.3 }}
          className="w-24 h-24 rounded-2xl bg-[#16d9f5]/10 border border-[#16d9f5]/30 flex items-center justify-center mb-8"
        >
          <Hammer className="w-12 h-12 text-[#16d9f5]" />
        </motion.div>

        <TypeReveal 
          text="Perakitan Komponen Otomatis" 
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
          Menggabungkan asset siap pakai dan pattern kerja untuk efisiensi maksimal.
        </motion.p>
      </div>
    </motion.div>
  );
}