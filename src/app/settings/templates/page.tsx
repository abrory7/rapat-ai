'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ClipboardList, ArrowRight, Lock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import TemplateForm from '@/components/settings/TemplateForm';
import styles from '../Settings.module.css';

interface Role {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
}

interface TemplateRole {
  role: Role;
  order: number;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  defaultFlow: string[];
  maxRounds: number;
  rules?: string;
  isBuiltIn: boolean;
  templateRoles: TemplateRole[];
}

interface TemplateData {
  id?: string;
  name: string;
  description?: string;
  maxRounds: number;
  rules?: string;
  roleIds: string[];
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const loadData = async () => {
    try {
      const [resTemplates, resRoles] = await Promise.all([
        fetch('/api/templates'),
        fetch('/api/roles'),
      ]);

      if (resTemplates.ok) setTemplates(await resTemplates.json());
      if (resRoles.ok) setRoles(await resRoles.json());
    } catch (error) {
      console.error('Failed to load templates configuration:', error);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    await loadData();
    setIsLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData().finally(() => setIsLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleOpenAddModal = () => {
    setEditingTemplate(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (template: Template) => {
    setEditingTemplate(template);
    setIsModalOpen(true);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this discussion template?')) {
      return;
    }
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTemplates(templates.filter((t) => t.id !== id));
      } else {
        alert('Failed to delete template.');
      }
    } catch (error) {
      console.error(error);
      alert('Error deleting template.');
    }
  };

  const handleFormSubmit = async (formData: TemplateData) => {
    const isEdit = !!formData.id;
    const url = isEdit ? `/api/templates/${formData.id}` : '/api/templates';
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
        alert(err.error || 'Failed to save template.');
      }
    } catch (error) {
      console.error(error);
      alert('Error saving template.');
    }
  };

  // Convert template data to TemplateForm compatible structure
  const formInitialData = editingTemplate
    ? {
        id: editingTemplate.id,
        name: editingTemplate.name,
        description: editingTemplate.description,
        maxRounds: editingTemplate.maxRounds,
        rules: editingTemplate.rules,
        roleIds: editingTemplate.templateRoles.map((tr) => tr.role.id),
      }
    : undefined;

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.navLink}>
        &larr; Back to Dashboard
      </Link>

      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Discussion Templates</h1>
          <span className={styles.subtitle}>
            Configure structured flows of agent lineups, discussion limits, and guidelines.
          </span>
        </div>
        <Button onClick={handleOpenAddModal} variant="primary">
          + Create Template
        </Button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
          Loading templates...
        </div>
      ) : (
        <div className={`${styles.cardGrid} animate-fade-in-up`}>
          {templates.length === 0 ? (
            <div className={styles.emptyState}>
              <ClipboardList style={{ width: '48px', height: '48px', color: 'var(--text-tertiary)', marginBottom: '16px' }} />
              <h3>No Templates Configured</h3>
              <p>Add custom templates to define personalized discussion workflows.</p>
              <Button onClick={handleOpenAddModal}>+ Create Your First Template</Button>
            </div>
          ) : (
            templates.map((t) => (
              <div key={t.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardName}>{t.name}</h3>
                  {t.isBuiltIn && (
                    <span title="System built-in template (read-only)" className={styles.lockWrapper}>
                      <Lock className={styles.lockIcon} size={12} />
                    </span>
                  )}
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.cardPrompt}>
                    {t.description || 'No description provided.'}
                  </p>
                  <div className={styles.detailSection}>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Max Rounds:</span>
                      <span className={styles.detailVal}>{t.maxRounds}</span>
                    </div>
                  </div>

                  {t.templateRoles.length > 0 && (
                    <div className={styles.skillsSection}>
                      <span className={styles.skillsLabel}>
                        Lineup Flow:
                      </span>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'wrap',
                          marginTop: 6,
                        }}
                      >
                        {t.templateRoles.map(({ role }, idx) => (
                          <React.Fragment key={role.id}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: '0.75rem',
                                border: `1px solid ${role.color}30`,
                                backgroundColor: `${role.color}15`,
                                color: role.color,
                                fontWeight: 500,
                              }}
                            >
                              <span>{role.icon}</span>
                              <span>{role.name}</span>
                            </span>
                            {idx < t.templateRoles.length - 1 && (
                              <ArrowRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.cardActions}>
                  <Button
                    onClick={() => handleOpenEditModal(t)}
                    variant="secondary"
                    size="sm"
                  >
                    Edit
                  </Button>
                  {!t.isBuiltIn && (
                    <Button
                      onClick={() => handleDeleteTemplate(t.id)}
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
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTemplate ? 'Edit Template' : 'Create Template'}
      >
        <TemplateForm
          initialData={formInitialData}
          roles={roles}
          onSubmit={handleFormSubmit}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
