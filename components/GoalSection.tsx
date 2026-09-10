import React from 'react';
import { motion } from 'framer-motion';
import { Button } from './ui/Button';

const entregaveis = [
  { icon: 'bi-layers', name: 'Script em duas versões', desc: 'Treinamento traz as aulas e as tarefas de cada passo. Campo sai na impressora.' },
  { icon: 'bi-chat-quote', name: 'Falas com título', desc: 'As falas na ordem, com espaço para personalizar na hora.' },
  { icon: 'bi-play-btn', name: 'Treinamentos por passo', desc: 'As aulas indicadas para o passo que você vai treinar.' },
  { icon: 'bi-file-earmark-arrow-down', name: 'Preparação para baixar', desc: 'O checklist da Dani Martins: 10 perguntas para avaliar a reunião.' },
  { icon: 'bi-easel', name: 'Apresentação comercial em PPTX', desc: 'Depois do script aprovado: slides para o cliente e suas falas nas notas.' },
];

const etapas = [
  { numero: '1', nome: 'Escolha', desc: 'Comece pelo essencial ou vá na ficha completa. Nada se perde.' },
  { numero: '2', nome: 'Base do script', desc: 'Suba materiais e cole links. A IA lê, transcreve e preenche as respostas.' },
  { numero: '3', nome: 'Script', desc: 'Confira cada resposta com a fonte ao lado e receba o script.' },
  { numero: '4', nome: 'Ajustes', desc: 'Uma atualização da ficha e uma rodada de grifos no texto.' },
];

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
                {entregaveis.map((item, index) => (
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
              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-white mb-6 sm:mb-8 px-2">
                Como funciona
              </h2>

              <ol className="space-y-5 sm:space-y-6 mb-8 sm:mb-10 px-2">
                {etapas.map((etapa, index) => (
                  <motion.li
                    key={etapa.numero}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: index * 0.08 }}
                    className="flex items-start gap-4"
                  >
                    <span className="font-serif text-2xl sm:text-3xl text-prosperus-gold/40 leading-none flex-shrink-0 w-7">{etapa.numero}</span>
                    <div>
                      <p className="font-sans font-bold uppercase tracking-widest text-[10px] sm:text-xs text-prosperus-gold mb-1">{etapa.nome}</p>
                      <p className="font-sans text-sm sm:text-base text-prosperus-neutral-grey/80 leading-relaxed">{etapa.desc}</p>
                    </div>
                  </motion.li>
                ))}
              </ol>

              <Button
                variant="link"
                className="group flex items-center gap-3 sm:gap-4 text-prosperus-gold-light hover:text-white mx-2"
                onClick={() => document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <span className="font-sans font-bold uppercase tracking-widest text-xs sm:text-sm">Entrar com o meu e-mail</span>
                <span className="group-hover:-translate-y-1 transition-transform">↑</span>
              </Button>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
};
