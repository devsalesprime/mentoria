import React from 'react';
import { motion } from 'framer-motion';

export const GoalSection: React.FC = () => {
  return (
    <section className="py-16 sm:py-20 md:py-24 relative overflow-hidden">
      {/* Abstract Background */}
      <div className="absolute inset-0 bg-prosperus-navy">
        <div className="absolute right-0 bottom-0 w-1/2 h-full bg-gradient-to-l from-[#05223a] to-transparent"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-10 sm:gap-12 md:gap-16">

          <div className="w-full lg:w-1/2">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="border border-prosperus-gold/20 p-8 sm:p-10 bg-white/5 backdrop-blur-sm"
            >
              <div className="text-center">
                <p className="font-sans text-xs sm:text-sm text-prosperus-neutral-grey uppercase tracking-widest mb-2">O Objetivo Final</p>
                <div className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-gold-gradient mb-2">30</div>
                <p className="font-serif text-xl sm:text-2xl text-white mb-4 sm:mb-6 px-2">Clientes High-Ticket de R$60k</p>
                <div className="w-16 h-[1px] bg-prosperus-gold/50 mx-auto mb-4 sm:mb-6"></div>
                <p className="font-sans text-sm sm:text-base text-prosperus-neutral-grey/80 px-2">
                  Qualificação mínima para o ecossistema<br />
                  <strong className="text-white">Mentoring League Society</strong><br />
                  de Flávio Augusto, Joel Jota e Caio Carneiro.
                </p>
              </div>
            </motion.div>
          </div>

          <div className="w-full lg:w-1/2">
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-white mb-4 sm:mb-6 px-2">
                Visão Estratégica
              </h2>
              <p className="font-sans text-base sm:text-lg text-prosperus-neutral-grey/80 mb-4 sm:mb-6 leading-relaxed px-2">
                Nós não apenas entregamos informação. Nós analisamos seu momento atual e desenhamos com você a estratégia exata para você atingir esses números.
              </p>
              <p className="font-sans text-base sm:text-lg text-prosperus-neutral-grey/80 mb-8 sm:mb-10 leading-relaxed px-2">
                Quanto melhores forem suas respostas neste diagnóstico, mais profunda será a nossa intervenção no seu negócio.
              </p>

              <button
                className="group flex items-center gap-3 sm:gap-4 text-prosperus-gold-light hover:text-white transition-colors mx-2"
                onClick={() => document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <span className="font-sans font-bold uppercase tracking-widest text-xs sm:text-sm">Voltar ao topo</span>
                <span className="group-hover:-translate-y-1 transition-transform">↑</span>
              </button>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
};