'use client';

import React, { useState } from 'react';
import Button from '../ui/Button';
import styles from '../settings/Form.module.css';

interface ProjectData {
  id?: string;
  name: string;
  description?: string;
  repoPath: string;
  ignoreRules?: string;
}

interface ProjectFormProps {
  initialData?: ProjectData;
  onSubmit: (data: ProjectData) => Promise<void>;
  onCancel: () => void;
}

export const ProjectForm: React.FC<ProjectFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [repoPath, setRepoPath] = useState(initialData?.repoPath || '');
  const [ignoreRules, setIgnoreRules] = useState(initialData?.ignoreRules || '');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !repoPath.trim()) {
      alert('Project Name and Repository Path are required.');
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({
        id: initialData?.id,
        name: name.trim(),
        description: description.trim() || undefined,
        repoPath: repoPath.trim(),
        ignoreRules: ignoreRules.trim() || undefined,
      });
    } catch (err) {
      console.error(err);
      alert('Failed to save project.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className={styles.formGroup}>
        <label className={styles.label}>Project Name *</label>
        <input
          type="text"
          className={styles.input}
          placeholder="e.g. My Website, Billing System"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Description</label>
        <input
          type="text"
          className={styles.input}
          placeholder="Brief explanation of this project"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Repository Path (Absolute path) *</label>
        <input
          type="text"
          className={styles.input}
          placeholder="e.g. /Users/username/projects/my-website"
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
          required
        />
        <span className={styles.helperText}>
          The absolute path to the local repository on your machine.
        </span>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Ignore Rules (.gitignore format)</label>
        <textarea
          className={styles.textarea}
          rows={5}
          placeholder="e.g.&#10;node_modules/&#10;.env*&#10;*.pem"
          value={ignoreRules}
          onChange={(e) => setIgnoreRules(e.target.value)}
        />
        <span className={styles.helperText}>
          Define file patterns that the AI agents should not be allowed to read or access.
        </span>
      </div>

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isLoading}>
          {initialData ? 'Save Changes' : 'Create Project'}
        </Button>
      </div>
    </form>
  );
};

export default ProjectForm;
