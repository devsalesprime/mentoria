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
              Você Responde. <span className="text-prosperus-gold italic">Nós Analisamos.</span>
            </h2>
            <p className="font-sans text-prosperus-neutral-grey/70 text-sm sm:text-base max-w-xl mx-auto px-4">
              Sem achismo. Sem conteúdo genérico. Cada linha do seu feedback nasce de algo que você respondeu.
            </p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {[
            {
              step: '01',
              title: 'Diagnóstico Guiado',
              desc: 'Responda 4 módulos sobre sua expertise, público, método e oferta, e escolha até 3 prioridades. Se quiser, compartilhe também seus perfis e materiais de venda atuais.',
              icon: 'bi-clipboard2-data',
            },
            {
              step: '02',
              title: 'Análise Personalizada',
              desc: 'A equipe Prosperus lê tudo o que você respondeu, olha os perfis e materiais que você compartilhou e cruza com as prioridades que você escolheu.',
              icon: 'bi-search',
            },
            {
              step: '03',
              title: 'Feedback Personalizado',
              desc: 'Em até 48h úteis, você recebe um documento com a análise de cada prioridade e 3 próximos passos concretos para colocar em prática já nesta semana.',
              icon: 'bi-file-earmark-text',
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
            Quanto melhores suas respostas, mais precisa a análise. Responda com profundidade — é disso que tudo é construído.
          </p>
        </motion.div>
      </div>
    </section>
  );
};