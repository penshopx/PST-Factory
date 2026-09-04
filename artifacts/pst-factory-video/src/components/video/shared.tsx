import { motion } from 'framer-motion';

export const springSnappy = { type: 'spring' as const, stiffness: 400, damping: 30 };
export const springBouncy = { type: 'spring' as const, stiffness: 300, damping: 15 };
export const springSmooth = { type: 'spring' as const, stiffness: 120, damping: 25 };

export function GridBackground({ opacity = 0.15 }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-0"
      style={{
        backgroundImage: `linear-gradient(rgba(145, 169, 189, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(145, 169, 189, 0.2) 1px, transparent 1px)`,
        backgroundSize: '4vw 4vw',
      }}
    />
  );
}

export function NoiseOverlay() {
  return (
    <div
      className="absolute inset-0 z-[100] pointer-events-none opacity-20 mix-blend-overlay"
      style={{
        backgroundImage: `url('data:image/svg+xml;utf8,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noiseFilter"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noiseFilter)"/%3E%3C/svg%3E')`,
      }}
    />
  );
}

export function TypeReveal({ text, className, delay = 0 }: { text: string, className?: string, delay?: number }) {
  const chars = text.split('');
  return (
    <h2 className={className}>
      {chars.map((char, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 20, rotateX: 90 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
          transition={{
            duration: 0.5,
            delay: delay + index * 0.03,
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : 'normal' }}
        >
          {char}
        </motion.span>
      ))}
    </h2>
  );
}
