'use client';

import React, { useState, useEffect } from 'react';
import Button from '../ui/Button';
import styles from './Form.module.css';

interface Role {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
}

interface TemplateData {
  id?: string;
  name: string;
  description?: string;
  maxRounds: number;
  rules?: string;
  roleIds: string[];
}

interface TemplateFormProps {
  initialData?: TemplateData;
  roles: Role[];
  onSubmit: (data: TemplateData) => Promise<void>;
  onCancel: () => void;
}

export const TemplateForm: React.FC<TemplateFormProps> = ({
  initialData,
  roles,
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [maxRounds, setMaxRounds] = useState(initialData?.maxRounds || 2);
  const [rules, setRules] = useState(initialData?.rules || '');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(
    initialData?.roleIds || []
  );
  const [isLoading, setIsLoading] = useState(false);

  const handleAddRole = (roleId: string) => {
    if (!selectedRoleIds.includes(roleId)) {
      setSelectedRoleIds([...selectedRoleIds, roleId]);
    }
  };

  const handleRemoveRole = (index: number) => {
    setSelectedRoleIds(selectedRoleIds.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...selectedRoleIds];
    const temp = newOrder[index];
    newOrder[index] = newOrder[index - 1];
    newOrder[index - 1] = temp;
    setSelectedRoleIds(newOrder);
  };

  const handleMoveDown = (index: number) => {
    if (index === selectedRoleIds.length - 1) return;
    const newOrder = [...selectedRoleIds];
    const temp = newOrder[index];
    newOrder[index] = newOrder[index + 1];
    newOrder[index + 1] = temp;
    setSelectedRoleIds(newOrder);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedRoleIds.length === 0) {
      alert('Template Name and at least one Selected Role are required.');
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({
        id: initialData?.id,
        name: name.trim(),
        description: description.trim() || undefined,
        maxRounds: Number(maxRounds),
        rules: rules.trim() || undefined,
        roleIds: selectedRoleIds,
      });
    } catch (e) {
      console.error(e);
      alert('Failed to save template.');
    } finally {
      setIsLoading(false);
    }
  };

  // Find details for selected roles
  const rolesMap = new Map(roles.map((r) => [r.id, r]));
  const orderedSelectedRoles = selectedRoleIds
    .map((id) => rolesMap.get(id))
    .filter((r): r is Role => !!r);

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className={styles.row}>
        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
          <label className={styles.label}>Template Name *</label>
          <input
            type="text"
            className={styles.input}
            placeholder="e.g. Software Feature Planning"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
          <label className={styles.label}>Max Discussion Rounds *</label>
          <input
            type="number"
            className={styles.input}
            min={1}
            max={10}
            value={maxRounds}
            onChange={(e) => setMaxRounds(Math.max(1, Number(e.target.value)))}
            required
          />
          <span className={styles.helperText}>Number of times each role speaks before closing.</span>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Description</label>
        <input
          type="text"
          className={styles.input}
          placeholder="Briefly summarize the goal of this discussion flow"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Discussion Rules (Markdown)</label>
        <textarea
          className={styles.textarea}
          rows={4}
          placeholder="Guidelines or restrictions for the discussion (e.g. Architect goes first, QA audits code)..."
          value={rules}
          onChange={(e) => setRules(e.target.value)}
        />
      </div>

      {/* Role Lineup Builder */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
        {/* Selected Roles (Order matters) */}
        <div>
          <label className={styles.label}>Selected Role Flow (Order of discussion) *</label>
          <div
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              padding: 10,
              minHeight: 180,
              backgroundColor: 'var(--bg-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {orderedSelectedRoles.length === 0 ? (
              <span
                style={{
                  color: 'var(--text-tertiary)',
                  fontSize: '0.85rem',
                  margin: 'auto',
                  textAlign: 'center',
                }}
              >
                No roles selected yet.<br />Click available roles on the right to add.
              </span>
            ) : (
              orderedSelectedRoles.map((role, index) => (
                <div
                  key={`${role.id}-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 6,
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderLeft: `4px solid ${role.color}`,
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{role.icon}</span>
                    <span>{role.name}</span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                      @{role.slug}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: index === 0 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                        cursor: index === 0 ? 'default' : 'pointer',
                        fontSize: '1rem',
                      }}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === selectedRoleIds.length - 1}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: index === selectedRoleIds.length - 1 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                        cursor: index === selectedRoleIds.length - 1 ? 'default' : 'pointer',
                        fontSize: '1rem',
                      }}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveRole(index)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--danger)',
                        cursor: 'pointer',
                        fontSize: '1.2rem',
                        lineHeight: 1,
                        marginLeft: 4,
                      }}
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Available Roles to Select */}
        <div>
          <label className={styles.label}>Available Roles</label>
          <div
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              padding: 10,
              maxHeight: 180,
              overflowY: 'auto',
              backgroundColor: 'var(--bg-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => handleAddRole(role.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  transition: 'background-color 0.15s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
              >
                <span>{role.icon}</span>
                <span style={{ flex: 1 }}>{role.name}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                  @{role.slug}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isLoading}>
          {initialData ? 'Save Changes' : 'Create Template'}
        </Button>
      </div>
    </form>
  );
};

export default TemplateForm;
