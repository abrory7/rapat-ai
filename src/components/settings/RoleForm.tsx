'use client';

import React, { useState, useEffect } from 'react';
import Button from '../ui/Button';
import styles from './Form.module.css';

interface Provider {
  id: string;
  name: string;
  type: string;
  models: string[];
}

interface Skill {
  id: string;
  name: string;
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

interface RoleFormProps {
  initialData?: RoleData;
  providers: Provider[];
  skills: Skill[];
  onSubmit: (data: RoleData) => Promise<void>;
  onCancel: () => void;
}

const COLOR_PRESETS = [
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#10b981', // Green
  '#f43f5e', // Rose
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#6b7280', // Gray
  '#ef4444', // Red
  '#14b8a6', // Teal
];

export const RoleForm: React.FC<RoleFormProps> = ({
  initialData,
  providers,
  skills,
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [slug, setSlug] = useState(initialData?.slug || '');
  const [systemPrompt, setSystemPrompt] = useState(initialData?.systemPrompt || '');
  const [providerId, setProviderId] = useState(initialData?.providerId || '');
  const [modelId, setModelId] = useState(initialData?.modelId || '');
  const [customModelId, setCustomModelId] = useState('');
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [color, setColor] = useState(initialData?.color || COLOR_PRESETS[0]);
  const [icon, setIcon] = useState(initialData?.icon || '🤖');
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>(
    initialData?.skillIds || []
  );
  const [isLoading, setIsLoading] = useState(false);

  // Auto-fill slug from name if not editing
  useEffect(() => {
    if (!initialData) {
      setSlug(
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
      );
    }
  }, [name, initialData]);

  // Find currently selected provider
  const selectedProvider = providers.find((p) => p.id === providerId);
  const availableModels = selectedProvider?.models || [];

  // Determine if initial modelId is custom (not in selected provider's models list)
  useEffect(() => {
    if (initialData?.modelId) {
      if (providerId && selectedProvider) {
        if (!selectedProvider.models.includes(initialData.modelId)) {
          setUseCustomModel(true);
          setCustomModelId(initialData.modelId);
        } else {
          setUseCustomModel(false);
          setModelId(initialData.modelId);
        }
      } else {
        setUseCustomModel(true);
        setCustomModelId(initialData.modelId);
      }
    }
  }, [initialData, providerId, providers, selectedProvider]);

  const handleToggleSkill = (skillId: string) => {
    if (selectedSkillIds.includes(skillId)) {
      setSelectedSkillIds(selectedSkillIds.filter((id) => id !== skillId));
    } else {
      setSelectedSkillIds([...selectedSkillIds, skillId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !systemPrompt.trim() || !color.trim() || !icon.trim()) {
      alert('Please fill in all required fields.');
      return;
    }

    const finalModelId = useCustomModel ? customModelId.trim() : modelId;

    setIsLoading(true);
    try {
      await onSubmit({
        id: initialData?.id,
        name: name.trim(),
        slug: slug.toLowerCase().trim(),
        systemPrompt: systemPrompt.trim(),
        providerId: providerId || undefined,
        modelId: finalModelId || undefined,
        color,
        icon,
        skillIds: selectedSkillIds,
      });
    } catch (e) {
      console.error(e);
      alert('Failed to save role.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className={styles.row}>
        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
          <label className={styles.label}>Role Name *</label>
          <input
            type="text"
            className={styles.input}
            placeholder="e.g. Lead Engineer"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
          <label className={styles.label}>Slug (for @MENTION) *</label>
          <input
            type="text"
            className={styles.input}
            placeholder="e.g. engineer"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            disabled={initialData?.id ? (initialData as any).isBuiltIn : false}
            required
          />
          <span className={styles.helperText}>Used to direct discussions (e.g. @engineer)</span>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>System Prompt / Instructions *</label>
        <textarea
          className={styles.textarea}
          rows={6}
          placeholder="Define this role's behavior, responsibilities, tone, and goals..."
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          required
        />
      </div>

      <div className={styles.row}>
        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
          <label className={styles.label}>AI Provider (Optional)</label>
          <select
            className={styles.select}
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
              setModelId('');
            }}
          >
            <option value="">-- No Provider Assigned --</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.type})
              </option>
            ))}
          </select>
          <span className={styles.helperText}>Assigns this role to run on this provider.</span>
        </div>

        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
          <label className={styles.label}>Model Assignment</label>
          {useCustomModel ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className={styles.input}
                placeholder="Enter custom model ID"
                value={customModelId}
                onChange={(e) => setCustomModelId(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setUseCustomModel(false)}
              >
                Select
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                className={styles.select}
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={!providerId}
                style={{ flex: 1 }}
              >
                <option value="">-- Select Model --</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setUseCustomModel(true)}
              >
                Custom
              </Button>
            </div>
          )}
          <span className={styles.helperText}>Select or write custom model identifier.</span>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
          <label className={styles.label}>Icon / Emoji *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className={styles.input}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              style={{ width: 60, textAlign: 'center', fontSize: '1.25rem' }}
              required
            />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {['🤖', '🏛️', '💼', '⚙️', '🛡️', '📈', '🎨', '📊', '🗣️', '🌟', '😈', '💡'].map(
                (emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setIcon(emoji)}
                    style={{
                      border: 'none',
                      background: 'none',
                      fontSize: '1.25rem',
                      cursor: 'pointer',
                      padding: 4,
                    }}
                  >
                    {emoji}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
          <label className={styles.label}>Color Accent *</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{
                border: 'none',
                background: 'none',
                width: 42,
                height: 42,
                cursor: 'pointer',
                padding: 0,
              }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setColor(preset)}
                  style={{
                    width: 20,
                    height: 20,
                    backgroundColor: preset,
                    border: color === preset ? '2px solid #fff' : '1px solid var(--border-color)',
                    borderRadius: '50%',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Attach Skills / Guidelines</label>
        <span className={styles.helperText}>Select skills to inject into the role instructions.</span>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginTop: 8,
            maxHeight: 150,
            overflowY: 'auto',
            padding: 10,
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          {skills.length === 0 ? (
            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
              No skills created yet. Add skills in Settings first.
            </span>
          ) : (
            skills.map((skill) => (
              <label
                key={skill.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedSkillIds.includes(skill.id)}
                  onChange={() => handleToggleSkill(skill.id)}
                />
                {skill.name}
              </label>
            ))
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isLoading}>
          {initialData ? 'Save Changes' : 'Create Role'}
        </Button>
      </div>
    </form>
  );
};

export default RoleForm;
