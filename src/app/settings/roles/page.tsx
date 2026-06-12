'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Lock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import RoleForm from '@/components/settings/RoleForm';
import styles from '../Settings.module.css';

interface Skill {
  id: string;
  name: string;
}

interface Provider {
  id: string;
  name: string;
  type: string;
  models: string[];
}

interface Role {
  id: string;
  name: string;
  slug: string;
  systemPrompt: string;
  modelId?: string;
  providerId?: string;
  color: string;
  icon: string;
  isBuiltIn: boolean;
  skills: { skill: Skill }[];
  provider?: Provider;
}

interface RoleData {
  id?: string;
  name: string;
  slug: string;
  systemPrompt: string;
  modelId?: string;
  providerId?: string;
  color: string;
  icon: string;
  skillIds: string[];
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadRoles = async () => {
    try {
      const [resRoles, resProviders, resSkills] = await Promise.all([
        fetch('/api/roles'),
        fetch('/api/providers'),
        fetch('/api/skills'),
      ]);

      if (resRoles.ok) setRoles(await resRoles.json());
      if (resProviders.ok) setProviders(await resProviders.json());
      if (resSkills.ok) setSkills(await resSkills.json());
    } catch (error) {
      console.error('Failed to load roles configuration:', error);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    await loadRoles();
    setIsLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRoles().finally(() => setIsLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleOpenAddModal = () => {
    setEditingRole(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (role: Role) => {
    setEditingRole(role);
    setIsModalOpen(true);
  };

  const handleDeleteRole = async (id: string) => {
    if (!confirm('Are you sure you want to delete this role? It will be removed from all discussion templates.')) {
      return;
    }
    try {
      const res = await fetch(`/api/roles/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setRoles(roles.filter((r) => r.id !== id));
      } else {
        alert('Failed to delete role.');
      }
    } catch (error) {
      console.error(error);
      alert('Error deleting role.');
    }
  };

  const handleFormSubmit = async (formData: RoleData) => {
    const isEdit = !!formData.id;
    const url = isEdit ? `/api/roles/${formData.id}` : '/api/roles';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save role.');
      }
    } catch (error) {
      console.error(error);
      alert('Error saving role.');
    }
  };

  const filteredRoles = roles.filter((r) => {
    const term = searchQuery.toLowerCase();
    return r.name.toLowerCase().includes(term) || r.slug.toLowerCase().includes(term);
  });

  // Convert role details to RoleForm compatible data structure
  const formInitialData = editingRole
    ? {
        id: editingRole.id,
        name: editingRole.name,
        slug: editingRole.slug,
        systemPrompt: editingRole.systemPrompt,
        modelId: editingRole.modelId,
        providerId: editingRole.providerId,
        color: editingRole.color,
        icon: editingRole.icon,
        skillIds: editingRole.skills.map((s) => s.skill.id),
      }
    : undefined;

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.navLink}>
        &larr; Back to Dashboard
      </Link>

      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>System Roles</h1>
          <span className={styles.subtitle}>
            Configure AI agents representing different expert perspectives in discussion templates.
          </span>
        </div>
        <Button onClick={handleOpenAddModal} variant="primary">
          + Create Role
        </Button>
      </div>

      {isLoading ? (
        <div className={styles.loadingText}>
          Loading roles...
        </div>
      ) : (
        <>
          {roles.length > 0 && (
            <div className={styles.toolbar}>
              <input
                type="text"
                placeholder="Search roles by name or @slug..."
                className={styles.searchInput}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          <div className={`${styles.cardGrid} animate-fade-in-up`}>
            {roles.length === 0 ? (
              <div className={styles.emptyState}>
                <Users className={styles.emptyStateIcon} />
                <h3>No Roles Configured</h3>
                <p>Add custom roles to define specific lineups for your projects.</p>
                <Button onClick={handleOpenAddModal}>+ Create Your First Role</Button>
              </div>
            ) : filteredRoles.length === 0 ? (
              <div className={styles.emptyStateSearch}>
                <Users className={styles.emptyStateIcon} />
                <h3>No Matches Found</h3>
                <p>No roles match your search term &quot;{searchQuery}&quot;.</p>
                <Button onClick={() => setSearchQuery('')} variant="secondary">
                  Clear Search
                </Button>
              </div>
            ) : (
              filteredRoles.map((r) => (
                <div
                  key={r.id}
                  className={styles.card}
                >
                  <div className={styles.cardHeader}>
                    <div className={styles.cardMetaGroup}>
                      <span
                        className={styles.iconContainer}
                        style={{ backgroundColor: `${r.color}15`, color: r.color }}
                      >
                        {r.icon}
                      </span>
                      <div className={styles.cardTitleArea}>
                        <h3 className={styles.cardName}>{r.name}</h3>
                        <div className={styles.cardSlugWrapper}>
                          <code className={styles.cardSlug}>@{r.slug}</code>
                        </div>
                      </div>
                    </div>
                    {r.isBuiltIn && (
                      <span title="System built-in role (read-only)" className={styles.lockWrapper}>
                        <Lock
                          className={styles.lockIcon}
                          size={12}
                        />
                      </span>
                    )}
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardPrompt}>
                      {r.systemPrompt}
                    </p>

                    <div className={styles.detailSection}>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Provider:</span>
                        <span className={styles.detailVal}>
                          {r.provider ? r.provider.name : <em className={styles.emptyValue}>None</em>}
                        </span>
                      </div>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Model ID:</span>
                        <span className={styles.detailVal}>
                          {r.modelId ? r.modelId : <em className={styles.emptyValue}>None</em>}
                        </span>
                      </div>
                    </div>

                    {r.skills.length > 0 && (
                      <div className={styles.skillsSection}>
                        <span className={styles.skillsLabel}>
                          Skills attached:
                        </span>
                        <div className={styles.tagList}>
                          {r.skills.map(({ skill }) => (
                            <span key={skill.id} className={styles.tag}>
                              {skill.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                <div className={styles.cardActions}>
                  <Button
                    onClick={() => handleOpenEditModal(r)}
                    variant="secondary"
                    size="sm"
                  >
                    Edit
                  </Button>
                  {!r.isBuiltIn && (
                    <Button
                      onClick={() => handleDeleteRole(r.id)}
                      variant="danger"
                      size="sm"
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </>
    )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRole ? 'Edit Role' : 'Create Role'}
      >
        <RoleForm
          initialData={formInitialData}
          providers={providers}
          skills={skills}
          onSubmit={handleFormSubmit}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
