import React from 'react';
import SetupWizard from '@/components/setup/SetupWizard';

export default function SetupPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        backgroundColor: 'var(--bg-primary)',
        padding: 20,
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 850,
            background: 'linear-gradient(135deg, #ffffff 0%, var(--accent-primary) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Welcome to Rapat AI
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: '1.05rem' }}>
          Let's configure your workspace in just 3 quick steps.
        </p>
      </div>
      <SetupWizard />
    </div>
  );
}
