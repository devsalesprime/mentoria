import React from 'react';
import { motion } from 'framer-motion';
import { Button } from './ui/Button';

export const GoalSection: React.FC = () => {
  return (
    <section className="py-16 sm:py-20 md:py-24 relative overflow-hidden">
      {/* Abstract Background */}
      <div className="absolute inset-0 bg-prosperus-navy">
        <div className="absolute right-0 bottom-0 w-1/2 h-full bg-gradient-to-l from-prosperus-navy-mid to-transparent"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="flex flex-col lg:flex-row items-stretch gap-10 sm:gap-12 md:gap-16">

          <div className="w-full lg:w-1/2">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="border border-prosperus-gold/20 p-8 sm:p-10 bg-white/5 backdrop-blur-sm h-full"
            >
              <p className="font-sans text-xs sm:text-sm text-prosperus-gold uppercase tracking-widest mb-6 sm:mb-8">O Que Você Recebe</p>
              <ul className="space-y-4 sm:space-y-5">
                {[
                  { icon: 'bi-bullseye', name: 'Brand Brain', nameHint: 'cérebro da marca', desc: 'Seu posicionamento estratégico completo — DNA de marca documentado' },
                  { icon: 'bi-window-desktop', name: 'MVP de Landing Page', desc: 'Estrutura de página de captura pronta para você refinar' },
                  { icon: 'bi-camera-video', name: 'Script de VSL', desc: 'Base de roteiro persuasivo para você adaptar e gravar' },
                  { icon: 'bi-send', name: 'Script de Prospecção', desc: 'Roteiro de ligação para pré-qualificação e agendamento' },
                  { icon: 'bi-calendar-check', name: 'Fluxo de Cadência', desc: 'Sequência de follow-up estruturada para nutrir e converter' },
                  { icon: 'bi-chat-square-quote', name: 'Script de Venda', desc: 'Estrutura de fechamento high-ticket baseada no método PRIME e 7 passos da venda' },
                  { icon: 'bi-journal-check', name: 'Kit de Ferramentas', desc: 'Guia operacional completo da sua mentoria' },
                ].map((item, index) => (
                  <motion.li
                    key={item.name}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: index * 0.08 }}
                    className="flex items-start gap-3 sm:gap-4"
                  >
                    <i className={`bi ${item.icon} text-prosperus-gold text-base sm:text-lg flex-shrink-0 mt-0.5`}></i>
                    <div>
                      <p className="font-serif text-base sm:text-lg text-white">
                        {item.name}
                        {'nameHint' in item && item.nameHint && (
                          <span className="italic text-prosperus-neutral-grey/50 text-sm ml-1">({item.nameHint})</span>
                        )}
                      </p>
                      <p className="font-sans text-xs sm:text-sm text-prosperus-neutral-grey/60">{item.desc}</p>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </div>

          <div className="w-full lg:w-1/2 flex flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-white mb-4 sm:mb-6 px-2">
                Nada Genérico. <br />
                <span className="text-gold-gradient italic">Tudo Sob Medida.</span>
              </h2>
              <p className="font-sans text-base sm:text-lg text-prosperus-neutral-grey/80 mb-4 sm:mb-6 leading-relaxed px-2">
                A maioria dos especialistas leva meses e milhares de reais para montar posicionamento, escrever scripts e criar materiais de venda. Muitos nem começam.
              </p>
              <p className="font-sans text-base sm:text-lg text-prosperus-neutral-grey/80 mb-8 sm:mb-10 leading-relaxed px-2">
                Aqui, você recebe <strong className="text-white">um ponto de partida sólido, construído a partir da sua expertise</strong>. Pode precisar de ajustes, mas é mais rápido do que começar do zero e mais estratégico do que fazer sozinho.
              </p>

              <Button
                variant="link"
                className="group flex items-center gap-3 sm:gap-4 text-prosperus-gold-light hover:text-white mx-2"
                onClick={() => document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <span className="font-sans font-bold uppercase tracking-widest text-xs sm:text-sm">Começar Diagnóstico</span>
                <span className="group-hover:-translate-y-1 transition-transform">↑</span>
              </Button>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
};