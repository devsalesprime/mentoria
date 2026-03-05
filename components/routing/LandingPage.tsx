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

  const handleStartModule = (moduleId: string) => {
    navigate('/login', { state: { targetModule: moduleId } });
  };

  return (
    <div className="min-h-screen bg-prosperus-navy text-white selection:bg-prosperus-gold selection:text-prosperus-navy-dark" id="hero">
      <Header
        onOpenLogin={() => handleStartModule('overview')}
      />
      <main>
        <Hero onStartDiagnosis={() => handleStartModule('overview')} />
        <ImportantInfo />
        <ModulesOverview onStartModule={handleStartModule} />
        <GoalSection />
      </main>
      <Footer />
    </div>
  );
};
