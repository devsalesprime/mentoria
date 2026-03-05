import React from 'react';
import { motion } from 'framer-motion';

export const ImportantInfo: React.FC = () => {
  return (
    <section className="py-12 sm:py-16 md:py-20 bg-prosperus-navy-dark border-y border-prosperus-navy-light/30">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="text-center mb-10 sm:mb-14">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="font-serif text-3xl sm:text-4xl text-white mb-3 sm:mb-4 px-2">
              Você Responde. <span className="text-prosperus-gold italic">Nós Entregamos.</span>
            </h2>
            <p className="font-sans text-prosperus-neutral-grey/70 text-sm sm:text-base max-w-xl mx-auto px-4">
              Sem achismo. Sem conteúdo genérico. Tudo construído a partir das suas respostas.
            </p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {[
            {
              step: '01',
              title: 'Diagnóstico Guiado',
              desc: 'Responda 4 módulos sobre sua expertise, público, método e oferta. Cada pergunta foi desenhada para extrair o que posiciona e vende.',
              icon: 'bi-clipboard2-data',
            },
            {
              step: '02',
              title: 'Brand Brain',
              subtitle: 'cérebro da marca',
              desc: 'Analisamos suas respostas, pesquisamos seu mercado e geramos seu documento estratégico — posicionamento, linguagem e diferencial, tudo definido.',
              icon: 'bi-cpu',
            },
            {
              step: '03',
              title: 'Ativos de Venda',
              desc: 'Com o Brand Brain validado por você, geramos scripts de venda, copy de landing page, cadência de prospecção e roteiro de VSL. Um ponto de partida sólido que você adapta ao seu estilo.',
              icon: 'bi-rocket-takeoff',
            },
          ].map((item, index) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className="relative bg-prosperus-navy p-6 sm:p-8 border border-white/5 hover:border-prosperus-gold-dark/40 transition-colors duration-300"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gold-gradient"></div>
              <div className="flex items-center gap-3 mb-4">
                <span className="font-serif text-3xl sm:text-4xl text-prosperus-gold/20">{item.step}</span>
                <i className={`bi ${item.icon} text-prosperus-gold text-lg sm:text-xl`}></i>
              </div>
              <h3 className="font-serif text-xl sm:text-2xl text-white mb-2 sm:mb-3">
                {item.title}
                {'subtitle' in item && item.subtitle && (
                  <span className="italic text-prosperus-neutral-grey/50 text-base sm:text-lg ml-1">({item.subtitle})</span>
                )}
              </h3>
              <p className="font-sans text-prosperus-neutral-grey/70 text-sm leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-8 sm:mt-10 text-center"
        >
          <p className="font-sans text-sm text-prosperus-gold/80 italic px-4">
            Quanto melhores suas respostas, mais poderosos seus materiais. Responda com profundidade — é disso que tudo é construído.
          </p>
        </motion.div>
      </div>
    </section>
  );
};