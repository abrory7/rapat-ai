'use client';

import React, { useState } from 'react';
import { CloudDownload } from 'lucide-react';
import Button from '../ui/Button';
import styles from './Form.module.css';

interface ProviderData {
  id?: string;
  name: string;
  type: string;
  baseUrl?: string;
  apiKey: string;
  models: string[];
}

interface ProviderFormProps {
  initialData?: ProviderData;
  onSubmit: (data: ProviderData) => Promise<void>;
  onCancel: () => void;
}

const DEFAULT_MODELS_BY_TYPE: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o1-preview'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-20240229'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  ollama: ['llama3', 'mistral', 'codegemma', 'phi3'],
  'openai-compatible': ['deepseek-chat', 'llama3.1', 'qwen-plus'],
  'anthropic-compatible': ['claude-3-5-sonnet'],
};

export const ProviderForm: React.FC<ProviderFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [type, setType] = useState(initialData?.type || 'openai');
  const [baseUrl, setBaseUrl] = useState(initialData?.baseUrl || '');
  const [apiKey, setApiKey] = useState(initialData?.apiKey || '');
  const [models, setModels] = useState<string[]>(
    initialData?.models || DEFAULT_MODELS_BY_TYPE[initialData?.type || 'openai'] || []
  );
  const [newModel, setNewModel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);
  const [availableFetchedModels, setAvailableFetchedModels] = useState<string[]>([]);

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      alert('Please enter an API Key first.');
      return;
    }
    
    if (isCompatibleType && !baseUrl.trim()) {
      alert('Please enter a Base URL for custom compatible provider types.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/providers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          baseUrl: baseUrl.trim() || undefined,
          apiKey: apiKey,
          modelId: models[0] || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.valid) {
        setTestResult({
          success: true,
          message: 'Connection succeeded! The API credentials are valid.',
        });
      } else {
        console.error('[Provider Validation Failed] Details:', {
          status: res.status,
          error: data.error,
          rawResponse: data.raw,
        });

        let displayMessage = data.error || 'Failed to validate API credentials.';
        if (data.raw) {
          displayMessage += `\n\n[Raw Upstream Response]:\n${JSON.stringify(data.raw, null, 2)}`;
        }
        setTestResult({
          success: false,
          message: displayMessage,
        });
      }
    } catch (error) {
      console.error('Test connection error:', error);
      setTestResult({
        success: false,
        message: 'Network error. Failed to reach verification endpoint.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleFetchModels = async () => {
    if (!apiKey.trim()) {
      alert('Please enter an API Key first.');
      return;
    }
    if (isCompatibleType && !baseUrl.trim()) {
      alert('Please enter a Base URL for custom compatible provider types.');
      return;
    }

    setIsFetchingModels(true);
    setFetchModelsError(null);
    setAvailableFetchedModels([]);

    try {
      const res = await fetch('/api/providers/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          baseUrl: baseUrl.trim() || undefined,
          apiKey: apiKey,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.models) {
        setAvailableFetchedModels(data.models);
      } else {
        setFetchModelsError(data.error || 'Failed to fetch models from provider.');
      }
    } catch (e) {
      console.error(e);
      setFetchModelsError('Network error while fetching models.');
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleAddCustomModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (newModel.trim() && !models.includes(newModel.trim())) {
      setModels([...models, newModel.trim()]);
      setNewModel('');
    }
  };

  const handleRemoveModel = (modelName: string) => {
    setModels(models.filter((m) => m !== modelName));
  };

  const handleAddDefaultModel = (modelName: string) => {
    if (!models.includes(modelName)) {
      setModels([...models, modelName]);
    }
  };

  const isCompatibleType = type === 'openai-compatible' || type === 'anthropic-compatible';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !apiKey.trim() || (isCompatibleType && !baseUrl.trim()) || models.length === 0) {
      alert('Please fill in all required fields (including Base URL for custom compatible providers) and add at least one model.');
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({
        id: initialData?.id,
        name: name.trim(),
        type,
        baseUrl: baseUrl.trim() || undefined,
        apiKey: apiKey,
        models,
      });
    } catch (error) {
      console.error(error);
      alert('Failed to submit form.');
    } finally {
      setIsLoading(false);
    }
  };

  const availableDefaults = DEFAULT_MODELS_BY_TYPE[type] || [];

  return (
    <form onSubmit={handleSubmit}>
      <div className={styles.formGroup}>
        <label className={styles.label}>Provider Name *</label>
        <input
          type="text"
          className={styles.input}
          placeholder="e.g. My OpenAI, Local Ollama"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className={styles.row}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Provider Type *</label>
          <select
            className={styles.select}
            value={type}
            onChange={(e) => {
              const newType = e.target.value;
              setType(newType);
              if (!initialData) {
                const oldDefaults = DEFAULT_MODELS_BY_TYPE[type] || [];
                const isOnlyDefaults = models.every((m) => oldDefaults.includes(m));
                if (isOnlyDefaults || models.length === 0) {
                  setModels(DEFAULT_MODELS_BY_TYPE[newType] || []);
                }
              }
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google Gemini</option>
            <option value="ollama">Ollama (Local)</option>
            <option value="openai-compatible">OpenAI Compatible (Custom)</option>
            <option value="anthropic-compatible">Anthropic Compatible (Custom)</option>
          </select>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Base URL {isCompatibleType ? '*' : '(Optional)'}</label>
          <input
            type="text"
            className={styles.input}
            placeholder={
              type === 'ollama'
                ? 'http://localhost:11434'
                : type === 'openai-compatible'
                ? 'https://api.deepseek.com/v1 or http://localhost:1234/v1'
                : type === 'anthropic-compatible'
                ? 'http://localhost:8000/v1'
                : 'Default API endpoint'
            }
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            required={isCompatibleType}
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>API Key / Token *</label>
        <input
          type="password"
          className={styles.input}
          placeholder={initialData ? '•••••••• (unchanged)' : 'Enter API Key'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          required={!initialData}
        />
        {initialData && (
          <span className={styles.helperText}>
            Leave as is unless you want to update it.
          </span>
        )}
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Models *</label>
        <span className={styles.helperText}>
          Add the model identifiers that this provider is configured to use.
        </span>

        {/* Fetched models UI */}
        {availableFetchedModels.length > 0 && (
          <div style={{ marginTop: 8, marginBottom: 8, padding: 12, backgroundColor: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: 6 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              Available Models (Click to add):
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {availableFetchedModels.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleAddDefaultModel(m)}
                  disabled={models.includes(m)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.8rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-tertiary)',
                    color: models.includes(m) ? 'var(--text-tertiary)' : 'var(--text-primary)',
                    borderRadius: 4,
                    cursor: models.includes(m) ? 'default' : 'pointer',
                    transition: 'border-color 0.2s',
                  }}
                  onMouseOver={(e) => {
                    if (!models.includes(m)) e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  }}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                >
                  + {m}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <Button type="button" variant="secondary" size="sm" onClick={() => {
                const newModels = availableFetchedModels.filter(m => !models.includes(m));
                setModels([...models, ...newModels]);
              }}>
                Add All
              </Button>
            </div>
          </div>
        )}

        {fetchModelsError && (
          <div style={{ marginTop: 8, marginBottom: 8, padding: '8px 12px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 6, fontSize: '0.8rem' }}>
            <strong>Fetch Failed:</strong> {fetchModelsError}<br/>
            You can still manually enter the Model ID below.
          </div>
        )}

        {/* Custom model input & Fetch */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            type="text"
            className={styles.input}
            placeholder="Enter model ID manually"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button type="button" onClick={handleAddCustomModel} variant="secondary">
            Add
          </Button>
          <Button 
            type="button" 
            onClick={handleFetchModels} 
            variant="secondary" 
            isLoading={isFetchingModels}
            disabled={!apiKey.trim() || (isCompatibleType && !baseUrl.trim())}
          >
            <CloudDownload size={16} style={{ marginRight: 6 }} /> Fetch Models
          </Button>
        </div>

        {/* Selected models taglist */}
        <div className={styles.tagContainer}>
          {models.length === 0 ? (
            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', alignSelf: 'center' }}>
              No models added yet. Add at least one model.
            </span>
          ) : (
            models.map((model) => (
              <span key={model} className={styles.tag}>
                {model}
                <button
                  type="button"
                  className={styles.tagRemove}
                  onClick={() => handleRemoveModel(model)}
                >
                  &times;
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {testResult && (
        <div style={{
          marginBottom: 16,
          padding: '10px 14px',
          borderRadius: '6px',
          fontSize: '0.82rem',
          backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          color: testResult.success ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
          whiteSpace: 'pre-wrap',
          fontFamily: testResult.success ? 'inherit' : 'monospace',
        }}>
          {testResult.message}
        </div>
      )}

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading || isTesting}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleTestConnection}
          isLoading={isTesting}
          disabled={isLoading}
        >
          🔌 Test Connection
        </Button>
        <Button type="submit" variant="primary" isLoading={isLoading} disabled={isTesting}>
          {initialData ? 'Save Changes' : 'Add Provider'}
        </Button>
      </div>
    </form>
  );
};

export default ProviderForm;
