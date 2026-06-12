'use client';

import React, { useState } from 'react';
import Button from '../ui/Button';
import styles from './Form.module.css';

interface SkillData {
  id?: string;
  name: string;
  description?: string;
  content: string;
}

interface SkillEditorProps {
  initialData?: SkillData;
  onSubmit: (data: SkillData) => Promise<void>;
  onCancel: () => void;
}

export const SkillEditor: React.FC<SkillEditorProps> = ({
  initialData,
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [content, setContent] = useState(initialData?.content || '');
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) {
      alert('Name and content are required.');
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({
        id: initialData?.id,
        name: name.trim(),
        description: description.trim() || undefined,
        content: content,
      });
    } catch (e) {
      console.error(e);
      alert('Failed to save skill.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className={styles.formGroup}>
        <label className={styles.label}>Skill Name *</label>
        <input
          type="text"
          className={styles.input}
          placeholder="e.g. Code Review Checklist, Security Checklist"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={initialData?.id ? (initialData as any).isBuiltIn : false}
          required
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Description</label>
        <input
          type="text"
          className={styles.input}
          placeholder="Short explanation of what this skill does"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={initialData?.id ? (initialData as any).isBuiltIn : false}
        />
      </div>

      <div className={styles.formGroup}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <label className={styles.label} style={{ margin: 0 }}>
            Guidelines Content (Markdown) *
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              style={{
                padding: '4px 8px',
                fontSize: '0.8rem',
                backgroundColor: activeTab === 'edit' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'edit' ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              style={{
                padding: '4px 8px',
                fontSize: '0.8rem',
                backgroundColor: activeTab === 'preview' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'preview' ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Preview
            </button>
          </div>
        </div>

        {activeTab === 'edit' ? (
          <textarea
            className={styles.textarea}
            rows={12}
            placeholder="Write guidelines, checklist, or instructions in Markdown..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={initialData?.id ? (initialData as any).isBuiltIn : false}
            required
            style={{ fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: '1.4' }}
          />
        ) : (
          <div
            style={{
              minHeight: 250,
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              padding: 16,
              maxHeight: 300,
              overflowY: 'auto',
              fontSize: '0.95rem',
              lineHeight: '1.5',
            }}
          >
            {content ? (
              <div
                style={{ whiteSpace: 'pre-wrap' }}
                dangerouslySetInnerHTML={{
                  __html: content
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    // Very basic markdown parse
                    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                    .replace(/^\- (.*$)/gim, '<li>$1</li>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>'),
                }}
              />
            ) : (
              <span style={{ color: 'var(--text-tertiary)' }}>Nothing to preview</span>
            )}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        {!(initialData?.id && (initialData as any).isBuiltIn) && (
          <Button type="submit" variant="primary" isLoading={isLoading}>
            {initialData ? 'Save Changes' : 'Create Skill'}
          </Button>
        )}
      </div>
    </form>
  );
};

export default SkillEditor;
