import React from 'react';
import { motion } from 'framer-motion';

export const ImportantInfo: React.FC = () => {
  return (
    <section className="py-12 sm:py-16 md:py-20 bg-prosperus-navy-dark border-y border-prosperus-navy-light/30">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-10 md:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="font-serif text-3xl sm:text-4xl text-white mb-4 sm:mb-6 px-2">
              Não Desperdice <br />
              <span className="text-prosperus-gold italic">Seu Tempo.</span>
            </h2>
            <div className="space-y-4 sm:space-y-6 font-sans text-prosperus-neutral-grey/80 text-sm sm:text-base px-2">
              <p>
                Você tem uma mentoria individual agendada com nosso especialista. Esse tempo é valioso.
              </p>
              <p>
                Se você chegar sem contexto, passaremos a reunião fazendo perguntas básicas. Se você responder a este diagnóstico, passaremos a reunião <strong>construindo sua estratégia</strong>.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-prosperus-navy p-6 sm:p-8 border border-prosperus-gold-dark/30 relative"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gold-gradient"></div>
            <h3 className="font-serif text-xl sm:text-2xl text-prosperus-gold-light mb-3 sm:mb-4">Regra de Ouro</h3>
            <ul className="space-y-3 sm:space-y-4 font-sans text-xs sm:text-sm">
              <li className="flex items-start gap-2 sm:gap-3">
                <span className="text-green-400 text-base sm:text-lg flex-shrink-0">✓</span>
                <div>
                  <p>Obrigatório: Responda pelo menos os módulos <strong>1</strong> e <strong>2</strong> antes da reunião.</p>
                  <p className="text-[10px] sm:text-xs text-prosperus-neutral-grey/60 mt-2 italic leading-relaxed">
                    Atenção: Sem essas respostas prévias, parte da sua mentoria será inevitavelmente utilizada para preencher estas lacunas.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2 sm:gap-3">
                <span className="text-green-400 text-base sm:text-lg flex-shrink-0">✓</span>
                <p>Ideal: Responda todos os 4 módulos. Quanto mais contexto, melhor nosso feedback.</p>
              </li>
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
};