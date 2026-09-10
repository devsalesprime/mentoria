import React from 'react';
import { motion } from 'framer-motion';

const emes = [
  {
    id: '01',
    title: 'Meta',
    desc: 'O resultado que você quer, com número, prazo e cadência de venda.',
  },
  {
    id: '02',
    title: 'Mentor',
    desc: 'Sua história, suas habilidades e o posicionamento que sustenta a autoridade.',
  },
  {
    id: '03',
    title: 'Mentorado',
    desc: 'Quem você atende: dor, desejo, setor, bolso e território.',
  },
  {
    id: '04',
    title: 'Método',
    desc: 'Seu fio condutor: etapas, passos e a nomenclatura autoral.',
  },
  {
    id: '05',
    title: 'A Mentoria',
    desc: 'A oferta: promessa, formato, entrega e preço.',
  },
];

export const ModulesOverview: React.FC = () => {
  return (
    <section id="ficha" className="py-16 sm:py-20 md:py-24 bg-prosperus-navy relative">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-white mb-3 sm:mb-4 px-4">A ficha em 5 M's</h2>
          <p className="font-sans text-prosperus-neutral-grey/60 text-sm sm:text-base px-4">Cada M é um bloco da ficha. O que você confirmar vira o script.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
          {emes.map((eme, index) => (
            <motion.div
              key={eme.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative bg-prosperus-navy-mid p-5 sm:p-6 hover:bg-prosperus-navy-panel transition-colors duration-300 border border-white/5 hover:border-prosperus-gold-dark/50 flex flex-col"
            >
              <div className="absolute top-4 right-4 sm:top-5 sm:right-5 font-serif text-3xl sm:text-4xl text-white/5 group-hover:text-prosperus-gold/20 transition-colors">
                {eme.id}
              </div>

              <h3 className="font-serif text-xl sm:text-2xl text-white mb-3 sm:mb-4 group-hover:text-prosperus-gold-light transition-colors">{eme.title}</h3>

              <p className="font-sans text-prosperus-neutral-grey/70 text-sm leading-relaxed">
                {eme.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
