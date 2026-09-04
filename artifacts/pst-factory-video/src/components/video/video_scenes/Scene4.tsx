import { motion } from 'framer-motion';
import { GridBackground, NoiseOverlay, TypeReveal, springBouncy } from '../shared';
import { ClipboardCheck, CheckCircle2 } from 'lucide-react';

export function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 bg-[#07111d] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <GridBackground opacity={0.15} />
      <NoiseOverlay />

      <div className="absolute inset-0 flex items-center justify-center -translate-x-[20vw] opacity-30">
        <div className="w-[30vw] space-y-4">
          {[...Array(4)].map((_, i) => (
            <motion.div 
              key={i}
              className="h-12 rounded-lg border border-[#10b981]/40 bg-[#10b981]/10 flex items-center px-4 gap-4"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.2, ...springBouncy }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.8 + i * 0.2, ...springBouncy }}
              >
                <CheckCircle2 className="text-[#10b981] w-6 h-6" />
              </motion.div>
              <div className="h-2 w-full bg-[#10b981]/20 rounded-full" />
            </motion.div>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-start ml-[20vw]">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ ...springBouncy, delay: 0.3 }}
          className="w-24 h-24 rounded-2xl bg-[#10b981]/10 border border-[#10b981]/30 flex items-center justify-center mb-8"
        >
          <ClipboardCheck className="w-12 h-12 text-[#10b981]" />
        </motion.div>

        <TypeReveal 
          text="Validasi & Pemeriksaan" 
          className="text-[4vw] font-display font-extrabold text-[#edf7ff] tracking-tight text-left"
          delay={0.6}
        />
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.8, delay: 1.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 text-[1.5vw] text-[#91a9bd] font-medium text-left max-w-[40vw]"
        >
          Memastikan setiap parameter dan kriteria penerimaan terpenuhi sebelum terbit.
        </motion.p>
      </div>
    </motion.div>
  );
}