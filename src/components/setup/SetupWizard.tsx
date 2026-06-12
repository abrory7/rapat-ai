'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Button from '../ui/Button';
import ProviderForm from '../settings/ProviderForm';
import ProjectForm from '../project/ProjectForm';
import styles from './SetupWizard.module.css';
import formStyles from '../settings/Form.module.css';

interface Template {
  id: string;
  name: string;
  description?: string;
  defaultFlow: string[];
  templateRoles: { role: { name: string; icon: string; color: string } }[];
}

export const SetupWizard: React.FC = () => {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<Template[]>([]);

  // Fetch templates for Step 2
  useEffect(() => {
    if (step === 2) {
      fetch('/api/templates')
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setTemplates(data))
        .catch(() => {});
    }
  }, [step]);

  const handleProviderSubmit = async (providerData: unknown) => {
    // Save provider to DB
    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerData),
      });

      if (res.ok) {
        setStep(2);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save provider.');
      }
    } catch (e) {
      console.error(e);
      alert('Error saving provider.');
    }
  };

  const handleProjectSubmit = async (projectData: unknown) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData),
      });

      if (res.ok) {
        // Setup complete! Redirect to dashboard
        router.push('/');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create project.');
      }
    } catch (e) {
      console.error(e);
      alert('Error creating project.');
    }
  };

  return (
    <div className={styles.wizardCard}>
      {/* Wizard Header Progress */}
      <div className={styles.progressHeader}>
        <div className={`${styles.stepIndicator} ${step >= 1 ? styles.active : ''}`}>
          <span className={styles.stepNumber}>1</span>
          <span className={styles.stepLabel}>Provider</span>
        </div>
        <div className={styles.line} />
        <div className={`${styles.stepIndicator} ${step >= 2 ? styles.active : ''}`}>
          <span className={styles.stepNumber}>2</span>
          <span className={styles.stepLabel}>Templates</span>
        </div>
        <div className={styles.line} />
        <div className={`${styles.stepIndicator} ${step >= 3 ? styles.active : ''}`}>
          <span className={styles.stepNumber}>3</span>
          <span className={styles.stepLabel}>Project</span>
        </div>
      </div>

      {/* Step Contents */}
      {step === 1 && (
        <div className="animate-fade-in-up">
          <h2 className={styles.stepTitle}>Step 1: Configure AI Provider</h2>
          <p className={styles.stepDescription}>
            Rapat AI runs entirely local on your machine, but uses model APIs to power the agents. Configure your first provider to get started.
          </p>

          <ProviderForm
            onSubmit={handleProviderSubmit}
            onCancel={() => {}}
          />
        </div>
      )}

      {step === 2 && (
        <div className="animate-fade-in-up">
          <h2 className={styles.stepTitle}>Step 2: Review Predefined Lineup Templates</h2>
          <p className={styles.stepDescription}>
            Rapat AI comes bundled with expert agent lineups pre-configured for standard workflows.
          </p>

          <div className={styles.templateList}>
            {templates.map((t) => (
              <div key={t.id} className={styles.templateRow}>
                <div>
                  <h4 style={{ color: 'var(--text-primary)', fontWeight: 650 }}>{t.name}</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    {t.description}
                  </p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {t.templateRoles.map(({ role }, idx) => (
                      <span key={idx} className={styles.roleTag}>
                        {role.icon} {role.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className={formStyles.actions}>
            <Button onClick={() => setStep(3)} variant="primary">
              Continue to Project Setup &rarr;
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="animate-fade-in-up">
          <h2 className={styles.stepTitle}>Step 3: Connect Your First Project</h2>
          <p className={styles.stepDescription}>
            Specify a local Git repository or directory path. Rapat AI will scan files and direct discussions based on it.
          </p>

          <ProjectForm
            onSubmit={handleProjectSubmit}
            onCancel={() => setStep(2)}
          />
        </div>
      )}
    </div>
  );
};

export default SetupWizard;
