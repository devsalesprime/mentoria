import React from 'react';
import { motion } from 'framer-motion';
import { Button } from './ui/Button';

interface HeroProps {
  onStartDiagnosis: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onStartDiagnosis }) => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 px-4">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-prosperus-navy z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] md:w-[800px] h-[600px] md:h-[800px] bg-prosperus-navy-light opacity-30 rounded-full blur-[120px]"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 z-10 text-center relative">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl leading-tight mb-4 sm:mb-6 px-2">
            Construa Sua <br />
            <span className="text-gold-gradient italic">Mentoria High-Ticket</span>
          </h1>
          <p className="font-sans text-prosperus-neutral-grey text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed font-light px-4">
            Seu conhecimento vale muito. O caminho para seus primeiros 30 mentorados e entrada na MLS começa com esse diagnóstico.
          </p>

          <div className="flex flex-col items-center justify-center px-4">
            <Button onClick={onStartDiagnosis}>
              Começar Diagnóstico
            </Button>
            <p className="text-xs text-prosperus-neutral-grey/50 mt-4 max-w-xs text-center px-2">
              *Responda antes da primeira mentoria individual.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Mouse Scroll Indicator */}
      <motion.div
        className="absolute bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 hidden sm:flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="w-[26px] h-[42px] border-2 border-[#CA9A43]/60 rounded-full flex justify-center p-2 box-border">
            <motion.div
              className="w-1 h-1.5 bg-[#CA9A43] rounded-full"
              animate={{
                y: [0, 8, 0],
                opacity: [0, 1, 0]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </div>
        </div>
      </motion.div>
    </section>
  );
};