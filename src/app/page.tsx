'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FolderOpen } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ProjectCard from '@/components/project/ProjectCard';
import ProjectForm from '@/components/project/ProjectForm';
import styles from './page.module.css';

interface Project {
  id: string;
  name: string;
  description?: string;
  repoPath: string;
  _count?: {
    sessions: number;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const checkSetupAndFetchProjects = async () => {
      try {
        // 1. Check if providers exist
        const providersRes = await fetch('/api/providers');
        if (providersRes.ok) {
          const providers = await providersRes.json();
          if (providers.length === 0) {
            router.replace('/setup');
            return;
          }
        }

        // 2. Fetch projects
        const projectsRes = await fetch('/api/projects');
        if (projectsRes.ok) {
          const data = await projectsRes.json();
          setProjects(data);
        }
      } catch (err) {
        console.error('Error during dashboard load:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkSetupAndFetchProjects();
  }, [router]);

  const handleCreateProject = async (formData: any) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const newProj = await res.json();
        setIsModalOpen(false);
        // Refresh projects list
        const projectsRes = await fetch('/api/projects');
        if (projectsRes.ok) {
          setProjects(await projectsRes.json());
        }
        // Redirect to detail page
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

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loader}></div>
        <p>Loading your workspace...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.logoTitle}>Rapat AI</h1>
          <p className={styles.logoSubtitle}>
            Autopilot Discussion Workspace for Codebases & Projects
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/settings/providers">
            <Button variant="secondary">Settings</Button>
          </Link>
          <Button onClick={() => setIsModalOpen(true)} variant="primary">
            + New Project
          </Button>
        </div>
      </header>

      <main className={styles.mainContent}>
        <div className={styles.sectionHeader}>
          <h2>Local Projects</h2>
          <span className={styles.projectCount}>
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </span>
        </div>

        {projects.length === 0 ? (
          <div className={styles.emptyState}>
            <FolderOpen style={{ width: '48px', height: '48px', color: 'var(--text-tertiary)', marginBottom: '16px' }} />
            <h3>No Projects Found</h3>
            <p>
              Connect a local Git repository or folder to start orchestrated multi-agent discussions.
            </p>
            <Button onClick={() => setIsModalOpen(true)}>Create Your First Project</Button>
          </div>
        ) : (
          <div className={`${styles.projectGrid} animate-fade-in-up`}>
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                id={project.id}
                name={project.name}
                description={project.description}
                repoPath={project.repoPath}
                sessionCount={project._count?.sessions || 0}
              />
            ))}
          </div>
        )}
      </main>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Project"
      >
        <ProjectForm
          onSubmit={handleCreateProject}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
