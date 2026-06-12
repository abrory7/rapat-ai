'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BookOpen, Lock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import SkillEditor from '@/components/settings/SkillEditor';
import styles from '../Settings.module.css';

interface Skill {
  id: string;
  name: string;
  description?: string;
  content: string;
  isBuiltIn: boolean;
}

interface SkillData {
  id?: string;
  name: string;
  description?: string;
  content: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

  const loadSkills = async () => {
    try {
      const res = await fetch('/api/skills');
      if (res.ok) {
        const data = await res.json();
        setSkills(data);
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
    }
  };

  const fetchSkills = async () => {
    setIsLoading(true);
    await loadSkills();
    setIsLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSkills().finally(() => setIsLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleOpenAddModal = () => {
    setEditingSkill(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (skill: Skill) => {
    setEditingSkill(skill);
    setIsModalOpen(true);
  };

  const handleDeleteSkill = async (id: string) => {
    if (!confirm('Are you sure you want to delete this skill?')) {
      return;
    }
    try {
      const res = await fetch(`/api/skills/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSkills(skills.filter((s) => s.id !== id));
      } else {
        alert('Failed to delete skill.');
      }
    } catch (error) {
      console.error(error);
      alert('Error deleting skill.');
    }
  };

  const handleFormSubmit = async (formData: SkillData) => {
    const isEdit = !!formData.id;
    const url = isEdit ? `/api/skills/${formData.id}` : '/api/skills';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchSkills();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save skill.');
      }
    } catch (error) {
      console.error(error);
      alert('Error saving skill.');
    }
  };

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.navLink}>
        &larr; Back to Dashboard
      </Link>

      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>System Skills</h1>
          <span className={styles.subtitle}>
            Manage background guidelines and checklists attached to discussion roles to enhance their knowledge.
          </span>
        </div>
        <Button onClick={handleOpenAddModal} variant="primary">
          + Create Skill
        </Button>
      </div>

      {isLoading ? (
        <div className={styles.loadingText}>
          Loading skills...
        </div>
      ) : (
        <div className={`${styles.cardGrid} animate-fade-in-up`}>
          {skills.length === 0 ? (
            <div className={styles.emptyState}>
              <BookOpen className={styles.emptyStateIcon} />
              <h3>No Skills Found</h3>
              <p>Create custom guidelines and checklists that roles can use during discussions.</p>
              <Button onClick={handleOpenAddModal}>+ Create Your First Skill</Button>
            </div>
          ) : (
            skills.map((s) => (
              <div key={s.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardName}>{s.name}</h3>
                  {s.isBuiltIn && (
                    <span title="System built-in skill (read-only)" className={styles.lockWrapper}>
                      <Lock className={styles.lockIcon} size={12} />
                    </span>
                  )}
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.cardPrompt}>
                    {s.description || 'No description provided.'}
                  </p>
                  <div className={styles.skillContentCode}>
                    {s.content}
                  </div>
                </div>

                <div className={styles.cardActions}>
                  <Button
                    onClick={() => handleOpenEditModal(s)}
                    variant="secondary"
                    size="sm"
                  >
                    {s.isBuiltIn ? 'View' : 'Edit'}
                  </Button>
                  {!s.isBuiltIn && (
                    <Button
                      onClick={() => handleDeleteSkill(s.id)}
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
        title={editingSkill ? (editingSkill.isBuiltIn ? 'View Skill' : 'Edit Skill') : 'Create Skill'}
      >
        <SkillEditor
          initialData={editingSkill || undefined}
          onSubmit={handleFormSubmit}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
