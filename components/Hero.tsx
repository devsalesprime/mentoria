import React from 'react';
import { motion } from 'framer-motion';
import { Button } from './ui/Button';

interface HeroProps {
  onEntrar: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onEntrar }) => {
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
            O script de venda da sua mentoria <br />
            <span className="text-gold-gradient italic">nos 7 passos da Dani Martins</span>
          </h1>
          <p className="font-sans text-prosperus-neutral-grey text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed font-light px-4">
            Você manda <strong className="text-white">o que já tem</strong>, confere a ficha e recebe o script. Quanto mais contexto chegar, mais o script sai <strong className="text-white">com a sua voz</strong>.
          </p>

          <div className="flex flex-col items-center justify-center px-4">
            <Button onClick={onEntrar}>
              Entrar com o meu e-mail
            </Button>
            <p className="text-sm text-prosperus-neutral-grey/50 mt-4 max-w-sm text-center px-2">
              Sem senha: é o e-mail que você já usa com o Prosperus. Os avisos de cada etapa chegam no seu WhatsApp.
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
          <div className="w-[26px] h-[42px] border-2 border-prosperus-gold-dark/60 rounded-full flex justify-center p-2 box-border">
            <motion.div
              className="w-1 h-1.5 bg-prosperus-gold-dark rounded-full"
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
