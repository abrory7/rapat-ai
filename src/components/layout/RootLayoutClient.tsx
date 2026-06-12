'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '../sidebar/Sidebar';
import styles from './RootLayoutClient.module.css';

interface RootLayoutClientProps {
  children: React.ReactNode;
}

export const RootLayoutClient: React.FC<RootLayoutClientProps> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  
  const [checkingProviders, setCheckingProviders] = useState(true);
  const [hasProviders, setHasProviders] = useState<boolean | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const checkProviders = async () => {
      // Skip onboarding check for setup page itself
      if (pathname === '/setup') {
        setCheckingProviders(false);
        return;
      }

      try {
        const res = await fetch('/api/providers');
        if (res.ok) {
          const providers = await res.json();
          if (providers.length === 0) {
            setHasProviders(false);
            router.replace('/setup');
            return;
          }
          setHasProviders(true);
        } else {
          // If the API call fails, assume no providers or let them configure
          setHasProviders(false);
          router.replace('/setup');
          return;
        }
      } catch (err) {
        console.error('Error checking providers:', err);
        router.replace('/setup');
        return;
      } finally {
        setCheckingProviders(false);
      }
    };

    checkProviders();
  }, [pathname, router]);

  // Handle route change to close mobile sidebar
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  if (checkingProviders) {
    return (
      <div className={styles.loadingOverlay}>
        <div className={styles.spinner}></div>
        <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
          Configuring workspace...
        </p>
      </div>
    );
  }

  // Setup page takes full viewport with no sidebar
  if (pathname === '/setup') {
    return <>{children}</>;
  }

  // If we don't have providers, show loading/redirect screen
  if (hasProviders === false) {
    return (
      <div className={styles.loadingOverlay}>
        <div className={styles.spinner}></div>
        <p>Redirecting to onboarding setup...</p>
      </div>
    );
  }

  return (
    <div className={styles.layoutContainer}>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      {/* Mobile background backdrop overlay */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 99,
          }}
        />
      )}

      <div className={styles.mainContent}>
        {/* Mobile Header */}
        <header className={styles.mobileHeader}>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className={styles.hamburgerBtn}
            aria-label="Open sidebar"
          >
            ☰
          </button>
          <div className={styles.mobileTitle}>Rapat AI</div>
          <div style={{ width: 32 }} /> {/* balance */}
        </header>

        {children}
      </div>
    </div>
  );
};

export default RootLayoutClient;
