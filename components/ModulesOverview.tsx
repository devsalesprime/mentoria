
import React from 'react';
import { motion } from 'framer-motion';

const modules = [
  {
    id: '01',
    dashboardId: 'mentor', // ID correspondente no Dashboard
    title: 'O Mentor',
    question: 'Quem é você?',
    desc: 'Extraímos sua história, autoridade e conquistas. Definimos por que alguém pagaria para ouvir você.',
    active: true
  },
  {
    id: '02',
    dashboardId: 'mentorado', // ID correspondente no Dashboard
    title: 'O Mentorado',
    question: 'Para quem você fala?',
    desc: 'Definimos o perfil do cliente ideal. Quem tem o problema que você resolve e o dinheiro para pagar.',
    active: true
  },
  {
    id: '03',
    dashboardId: 'metodo', // ID correspondente no Dashboard
    title: 'O Método',
    question: 'Como você resolve?',
    desc: 'Transformamos seu conhecimento empírico em um processo replicável. O passo a passo do sucesso.',
    active: true
  },
  {
    id: '04',
    dashboardId: 'entrega_fundacao', // ID correspondente no Dashboard
    title: 'A Oferta',
    question: 'O que eles levam?',
    desc: 'Formatamos o produto final. Duração, encontros, materiais e experiência do cliente.',
    active: true
  }
];

interface ModulesOverviewProps {
  onStartModule: (moduleId: string) => void;
}

export const ModulesOverview: React.FC<ModulesOverviewProps> = ({ onStartModule }) => {
  return (
    <section id="modules" className="py-16 sm:py-20 md:py-24 bg-prosperus-navy relative">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-white mb-3 sm:mb-4 px-4">Os 4 Pilares da Mentoria</h2>
          <p className="font-sans text-prosperus-neutral-grey/60 text-sm sm:text-base px-4">Um diagnóstico completo para estruturar seu negócio de educação.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {modules.map((mod, index) => (
            <motion.div
              key={mod.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative bg-[#061e33] p-6 sm:p-8 hover:bg-[#08243b] transition-colors duration-300 border border-white/5 hover:border-prosperus-gold-dark/50 flex flex-col"
            >
              <div className="absolute top-4 sm:top-6 right-4 sm:right-6 font-serif text-3xl sm:text-4xl text-white/5 group-hover:text-prosperus-gold/20 transition-colors">
                {mod.id}
              </div>

              <div className="flex-1">
                <div className="mb-4 sm:mb-6">
                  <h3 className="font-serif text-xl sm:text-2xl text-white mb-1 group-hover:text-prosperus-gold-light transition-colors">{mod.title}</h3>
                  <span className="font-sans text-[10px] sm:text-xs text-prosperus-gold uppercase tracking-widest">{mod.question}</span>
                </div>

                <p className="font-sans text-prosperus-neutral-grey/70 text-xs sm:text-sm leading-relaxed mb-6 sm:mb-8">
                  {mod.desc}
                </p>
              </div>

              <div className="mt-auto pt-3 sm:pt-4 border-t border-prosperus-gold/30">
                <button
                  onClick={() => onStartModule(mod.dashboardId)}
                  className="w-full text-left flex items-center justify-between group/btn transition-all duration-300 hover:bg-prosperus-gold/10 -mx-2 px-2 py-2 rounded"
                >
                  <span className="text-[10px] sm:text-xs font-bold font-sans uppercase transition-colors text-prosperus-gold group-hover/btn:text-prosperus-gold-light">
                    Iniciar Módulo
                  </span>
                  <span className="text-base sm:text-lg leading-none transition-transform duration-300 group-hover/btn:translate-x-1 text-prosperus-gold pe-2">→</span>
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
