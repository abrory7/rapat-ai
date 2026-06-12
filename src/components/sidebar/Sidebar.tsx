'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BrainCircuit,
  FolderGit2,
  PlusCircle,
  MessageSquare,
  Key,
  Users,
  Lightbulb,
  ClipboardList,
  Home,
  ChevronRight,
  Plus,
  X
} from 'lucide-react';
import ThemeToggle from '../ui/ThemeToggle';
import Modal from '../ui/Modal';
import ProjectForm from '../project/ProjectForm';
import Button from '../ui/Button';
import styles from './Sidebar.module.css';

interface Project {
  id: string;
  name: string;
  repoPath: string;
}

interface Session {
  id: string;
  projectId: string;
  topic: string;
  status: string;
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [sessions, setSessions] = useState<Record<string, Session[]>>({});
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);

  // Fetch projects list
  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Sidebar failed to fetch projects:', err);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [pathname]); // Refetch/sync when pathname changes to keep it updated

  // Fetch sessions for a specific project
  const fetchSessions = async (projectId: string) => {
    try {
      const res = await fetch(`/api/sessions?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setSessions((prev) => ({ ...prev, [projectId]: data }));
      }
    } catch (err) {
      console.error(`Sidebar failed to fetch sessions for project ${projectId}:`, err);
    }
  };

  // Auto-expand and fetch sessions for the current project in view
  useEffect(() => {
    if (!pathname) return;

    // Check if path is /project/[projectId] or /project/[projectId]/...
    const projectMatch = pathname.match(/^\/project\/([a-zA-Z0-9_-]+)/);
    if (projectMatch && projectMatch[1]) {
      const activeProjectId = projectMatch[1];
      setExpandedProjects((prev) => {
        if (!prev[activeProjectId]) {
          fetchSessions(activeProjectId);
          return { ...prev, [activeProjectId]: true };
        }
        return prev;
      });
    }
  }, [pathname]);

  const toggleProject = (projectId: string) => {
    const isExpanded = !expandedProjects[projectId];
    setExpandedProjects((prev) => ({ ...prev, [projectId]: isExpanded }));
    if (isExpanded) {
      fetchSessions(projectId);
    }
  };

  const handleCreateProject = async (formData: any) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const newProj = await res.json();
        setIsNewProjectModalOpen(false);
        await fetchProjects();
        // Automatically expand the new project
        setExpandedProjects((prev) => ({ ...prev, [newProj.id]: true }));
        fetchSessions(newProj.id);
        // Navigate
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

  const isActive = (path: string) => pathname === path;
  const isProjectActive = (id: string) => pathname === `/project/${id}`;
  const isSessionActive = (projId: string, sessId: string) =>
    pathname === `/project/${projId}/session/${sessId}`;

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
      <div className={styles.header}>
        <Link href="/" className={styles.logoArea}>
          <div className={styles.logoIcon}>
            <BrainCircuit size={20} className={styles.botIcon} />
          </div>
          <span className={styles.logoTitle}>Rapat AI</span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className={styles.closeBtn}
            aria-label="Close Sidebar"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div className={styles.navSection}>
        {/* Projects Section */}
        <div>
          <div className={styles.sectionTitle}>
            <span>Projects</span>
            <button
              onClick={() => setIsNewProjectModalOpen(true)}
              className={styles.addProjectBtn}
              title="Add New Project"
            >
              <Plus size={14} style={{ marginRight: 4 }} />
              Add
            </button>
          </div>
          <div className={styles.projectList}>
            {projects.length === 0 ? (
              <p style={{ padding: '0 12px', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                No projects. Create one!
              </p>
            ) : (
              projects.map((project) => {
                const isExpanded = !!expandedProjects[project.id];
                const projectSess = sessions[project.id] || [];

                return (
                  <div key={project.id} className={styles.projectItem}>
                    <div
                      className={`${styles.projectHeader} ${
                        isProjectActive(project.id) ? styles.active : ''
                      }`}
                      onClick={() => toggleProject(project.id)}
                    >
                      <Link
                        href={`/project/${project.id}`}
                        className={styles.projectTitle}
                        onClick={(e) => {
                          // Prevent triggering accordion toggle when clicking project name link
                          e.stopPropagation();
                        }}
                      >
                        <FolderGit2 size={16} /> {project.name}
                      </Link>
                      <ChevronRight size={14} className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`} />
                    </div>

                    {isExpanded && (
                      <div className={styles.sessionList}>
                        <Link
                          href={`/project/${project.id}/session/new`}
                          className={`${styles.sessionItem} ${
                            isActive(`/project/${project.id}/session/new`) ? styles.active : ''
                          }`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <PlusCircle size={14} /> <em>New Discussion</em>
                          </div>
                        </Link>
                        {projectSess.map((sess) => (
                          <Link
                            key={sess.id}
                            href={`/project/${project.id}/session/${sess.id}`}
                            className={`${styles.sessionItem} ${
                              isSessionActive(project.id, sess.id) ? styles.active : ''
                            }`}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              <MessageSquare size={14} style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sess.topic}</span>
                            </span>
                            <span
                              className={`${styles.statusDot} ${
                                sess.status === 'RUNNING' || sess.status === 'COMPILING'
                                  ? styles.running
                                  : sess.status === 'PAUSED'
                                  ? styles.paused
                                  : ''
                              }`}
                            />
                          </Link>
                        ))}
                        {projectSess.length === 0 && (
                          <span
                            style={{
                              padding: '6px 12px',
                              fontSize: '0.75rem',
                              color: 'var(--text-tertiary)',
                              fontStyle: 'italic',
                            }}
                          >
                            No discussions
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Settings Section */}
        <div>
          <div className={styles.sectionTitle}>
            <span>Settings</span>
          </div>
          <nav className={styles.settingsList}>
            <Link
              href="/settings/providers"
              className={`${styles.settingsItem} ${isActive('/settings/providers') ? styles.active : ''}`}
            >
              <Key size={16} /> Providers
            </Link>
            <Link
              href="/settings/roles"
              className={`${styles.settingsItem} ${isActive('/settings/roles') ? styles.active : ''}`}
            >
              <Users size={16} /> Discussion Roles
            </Link>
            <Link
              href="/settings/skills"
              className={`${styles.settingsItem} ${isActive('/settings/skills') ? styles.active : ''}`}
            >
              <Lightbulb size={16} /> Expert Skills
            </Link>
            <Link
              href="/settings/templates"
              className={`${styles.settingsItem} ${isActive('/settings/templates') ? styles.active : ''}`}
            >
              <ClipboardList size={16} /> Lineup Templates
            </Link>
          </nav>
        </div>
      </div>

      <div className={styles.footer}>
        <Link
          href="/"
          className={styles.footerLink}
        >
          <Home size={16} /> Dashboard
        </Link>
        <ThemeToggle />
      </div>

      <Modal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        title="Create New Project"
      >
        <ProjectForm
          onSubmit={handleCreateProject}
          onCancel={() => setIsNewProjectModalOpen(false)}
        />
      </Modal>
    </aside>
  );
};

export default Sidebar;
