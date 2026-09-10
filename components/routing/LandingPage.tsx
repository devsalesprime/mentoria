import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../Header';
import { Hero } from '../Hero';
import { ModulesOverview } from '../ModulesOverview';
import { ImportantInfo } from '../ImportantInfo';
import { GoalSection } from '../GoalSection';
import { Footer } from '../Footer';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const irParaLogin = () => {
    navigate('/login', { state: { targetModule: 'overview' } });
  };

  return (
    <div className="min-h-screen bg-prosperus-navy text-white selection:bg-prosperus-gold selection:text-prosperus-navy-dark" id="hero">
      <Header
        onOpenLogin={irParaLogin}
      />
      <main>
        <Hero onEntrar={irParaLogin} />
        <ImportantInfo />
        <ModulesOverview />
        <GoalSection />
      </main>
      <Footer />
    </div>
  );
};
