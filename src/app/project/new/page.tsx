'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProjectForm from '@/components/project/ProjectForm';
import styles from '@/app/settings/Settings.module.css';

export default function NewProjectPage() {
  const router = useRouter();

  const handleCreateProject = async (formData: any) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const newProj = await res.json();
        router.push(`/project/${newProj.id}`);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create project.');
      }
    } catch (error) {
      console.error(error);
      alert('Error creating project.');
    }
  };

  return (
    <div className={styles.container} style={{ maxWidth: 600 }}>
      <Link href="/" className={styles.navLink}>
        &larr; Back to Dashboard
      </Link>
      <div className={styles.header} style={{ marginBottom: 24 }}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>New Project</h1>
          <span className={styles.subtitle}>Connect a local directory to Rapat AI.</span>
        </div>
      </div>
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          padding: 24,
          borderRadius: 12,
          border: '1px solid var(--border-color)',
        }}
      >
        <ProjectForm onSubmit={handleCreateProject} onCancel={() => router.push('/')} />
      </div>
    </div>
  );
}
