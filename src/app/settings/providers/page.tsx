'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PlugZap, Activity, MessageSquare, Cpu, Send, AlertTriangle, Bot } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ProviderForm from '@/components/settings/ProviderForm';
import styles from '../Settings.module.css';
import formStyles from '@/components/settings/Form.module.css';

interface Provider {
  id: string;
  name: string;
  type: string;
  baseUrl?: string;
  apiKey: string;
  models: string[];
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [failedTestModels, setFailedTestModels] = useState<Set<string>>(() => new Set());

  // Model testing states
  const [selectedTestProviderId, setSelectedTestProviderId] = useState('');
  const [selectedTestModelId, setSelectedTestModelId] = useState('');
  const [testPrompt, setTestPrompt] = useState('halo, apakah tes berhasil?');
  const [testResponse, setTestResponse] = useState('');
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [testModelError, setTestModelError] = useState('');

  const getModelFailureKey = (providerId: string, modelId: string) => `${providerId}:${modelId}`;

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/providers');
      if (res.ok) {
        const data = await res.json();
        setProviders(data);
        if (data.length > 0) {
          setSelectedTestProviderId((prev) => {
            const currentId = prev || data[0].id;
            const activeProv = data.find((p: Provider) => p.id === currentId) || data[0];
            const models = activeProv.models || [];
            setSelectedTestModelId((prevModel) => {
              if (models.includes(prevModel)) return prevModel;
              return models[0] || '';
            });
            return activeProv.id;
          });
        } else {
          setSelectedTestProviderId('');
          setSelectedTestModelId('');
        }
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProviders();
  }, [fetchProviders]);

  const handleRunModelTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTestProviderId || !selectedTestModelId || !testPrompt.trim()) {
      alert('Please select a provider, model, and write a prompt.');
      return;
    }

    setIsTestingModel(true);
    setTestResponse('');
    setTestModelError('');

    try {
      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedTestProviderId,
          modelId: selectedTestModelId,
          prompt: testPrompt.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setTestResponse(data.response || 'No response returned from the model.');
      } else {
        const failedKey = getModelFailureKey(selectedTestProviderId, selectedTestModelId);
        setFailedTestModels((prev) => {
          const next = new Set(prev);
          next.add(failedKey);
          return next;
        });
        console.error('[Provider Model Test Failed] Details:', {
          status: res.status,
          error: data.error,
        });
        setTestModelError(data.error || 'Failed to complete provider test response.');
      }
    } catch (err) {
      console.error('[Provider Model Test Network Exception]:', err);
      setTestModelError('Network error. Failed to reach test endpoint.');
    } finally {
      setIsTestingModel(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingProvider(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = async (provider: Provider) => {
    // Fetch individual provider details to get the API Key (decrypted) for editing
    try {
      const res = await fetch(`/api/providers/${provider.id}`);
      if (res.ok) {
        const details = await res.json();
        setEditingProvider(details);
        setIsModalOpen(true);
      } else {
        alert('Failed to load provider details.');
      }
    } catch (e) {
      console.error(e);
      alert('Error loading provider details.');
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm('Are you sure you want to delete this provider? Roles referencing this provider will lose their AI configuration.')) {
      return;
    }
    try {
      const res = await fetch(`/api/providers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProviders(providers.filter((p) => p.id !== id));
      } else {
        alert('Failed to delete provider.');
      }
    } catch (error) {
      console.error(error);
      alert('Error deleting provider.');
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFormSubmit = async (formData: any) => {
    const isEdit = !!formData.id;
    const url = isEdit ? `/api/providers/${formData.id}` : '/api/providers';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchProviders();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save provider.');
      }
    } catch (error) {
      console.error(error);
      alert('Error saving provider.');
    }
  };

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.navLink}>
        &larr; Back to Dashboard
      </Link>

      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>AI Providers</h1>
          <span className={styles.subtitle}>
            Manage model providers (OpenAI, Anthropic, Gemini, Ollama) and their API credentials.
          </span>
        </div>
        <Button onClick={handleOpenAddModal} variant="primary">
          + Add Provider
        </Button>
      </div>

      {isLoading ? (
        <div className={styles.loadingText}>
          Loading providers...
        </div>
      ) : (
        <div className={styles.cardGrid}>
          {providers.length === 0 ? (
            <div className={styles.emptyState}>
              <PlugZap className={styles.emptyStateIcon} />
              <h3>No AI Providers Configured</h3>
              <p>Add at least one AI provider to configure your discussion templates.</p>
              <Button onClick={handleOpenAddModal}>+ Add Your First Provider</Button>
            </div>
          ) : (
            providers.map((p) => (
              <div key={p.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardName}>{p.name}</h3>
                  <span className={`${styles.badge} ${styles.badgePrimary}`}>
                    {p.type}
                  </span>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Base URL:</span>
                    <span className={styles.detailVal} title={p.baseUrl || 'Default'}>
                      {p.baseUrl || 'Default'}
                    </span>
                  </div>
                  <div className={styles.modelsSection}>
                    <span className={styles.modelsLabel}>
                      Configured Models:
                    </span>
                    <div className={styles.tagList}>
                      {p.models.map((m) => (
                        <span key={m} className={styles.tag}>
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.cardActions}>
                  <Button
                    onClick={() => handleOpenEditModal(p)}
                    variant="secondary"
                    size="sm"
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={() => handleDeleteProvider(p.id)}
                    variant="danger"
                    size="sm"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Dynamic Model Test Section */}
      <div style={{ marginTop: 40, borderTop: '1px solid var(--border-color)', paddingTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 8 }}>
          <Activity color="var(--accent-primary)" size={24} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Test Provider Response
          </h2>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
          Send a quick test message to any of your registered AI providers and check their actual response.
        </p>

        {providers.length === 0 ? (
          <div style={{
            padding: 24,
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 12,
            color: 'var(--text-tertiary)',
            textAlign: 'center'
          }}>
            Please add at least one AI Provider to test response.
          </div>
        ) : (
          <div className={styles.card} style={{ minHeight: 'auto', gap: 20 }}>
            <form onSubmit={handleRunModelTest} style={{ width: '100%' }}>
              <div className={formStyles.row} style={{ marginBottom: 16 }}>
                <div className={formStyles.formGroup}>
                  <label className={formStyles.label}>Select Provider</label>
                  <select
                    className={formStyles.select}
                    value={selectedTestProviderId}
                    onChange={(e) => {
                      const newProvId = e.target.value;
                      setSelectedTestProviderId(newProvId);
                      const provider = providers.find((p) => p.id === newProvId);
                      const models = provider?.models || [];
                      setSelectedTestModelId(models[0] || '');
                    }}
                    disabled={isTestingModel}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className={formStyles.formGroup}>
                  <label className={formStyles.label}>Select Model</label>
                  <select
                    className={formStyles.select}
                    value={selectedTestModelId}
                    onChange={(e) => setSelectedTestModelId(e.target.value)}
                    disabled={isTestingModel}
                  >
                    {(() => {
                      const activeProv = providers.find((p) => p.id === selectedTestProviderId);
                      const models = activeProv?.models || [];
                      if (models.length === 0) {
                        return <option value="">No models configured</option>;
                      }
                      return models.map((m) => (
                        <option key={m} value={m}>
                          {failedTestModels.has(getModelFailureKey(selectedTestProviderId, m))
                            ? `🔴 ${m}`
                            : m}
                        </option>
                      ));
                    })()}
                  </select>
                  <span className={formStyles.helperText} style={{ display: 'block', marginTop: 8 }}>
                    Models marked with a red dot failed at least once in this browser session.
                  </span>
                </div>
              </div>

              {/* Template Buttons */}
              <div className={formStyles.formGroup} style={{ marginBottom: 16 }}>
                <label className={formStyles.label}>Prompt Templates (Click to fill)</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setTestPrompt('halo, apakah tes berhasil?')}
                    className={styles.tag}
                    style={{ cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', transition: 'background-color 0.2s' }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                    disabled={isTestingModel}
                  >
                    <MessageSquare size={14} style={{ display: 'inline', marginRight: 4 }} /> halo, apakah tes berhasil?
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestPrompt('model apa yang sedang saya gunakan sekarang?')}
                    className={styles.tag}
                    style={{ cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', transition: 'background-color 0.2s' }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                    disabled={isTestingModel}
                  >
                    <Cpu size={14} style={{ display: 'inline', marginRight: 4 }} /> model apa yang sedang saya gunakan sekarang?
                  </button>
                </div>
              </div>

              <div className={formStyles.formGroup} style={{ marginBottom: 20 }}>
                <label className={formStyles.label}>Prompt / Message</label>
                <textarea
                  className={formStyles.textarea}
                  rows={3}
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  placeholder="Enter prompt to test model connection..."
                  disabled={isTestingModel}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: testResponse || testModelError ? 20 : 0 }}>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isTestingModel}
                  disabled={!selectedTestModelId}
                >
                  <Send size={16} style={{ marginRight: 6 }} /> Send Test Prompt
                </Button>
              </div>
            </form>

            {/* Test Results Output */}
            {(testResponse || testModelError) && (
              <div className="animate-fade-in-up" style={{
                width: '100%',
                padding: '16px',
                borderRadius: '8px',
                border: `1px solid ${testModelError ? 'var(--danger)' : 'var(--border-color)'}`,
                backgroundColor: 'var(--bg-primary)',
                marginTop: 10
              }}>
                <span style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: testModelError ? 'var(--danger)' : 'var(--accent-primary)',
                  display: 'block',
                  marginBottom: 8
                }}>
                  {testModelError ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={14} /> ERROR RESPONSE</span> : <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Bot size={14} /> MODEL RESPONSE</span>}
                </span>
                <p style={{
                  fontSize: '0.95rem',
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.5'
                }}>
                  {testModelError || testResponse}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProvider ? 'Edit AI Provider' : 'Add AI Provider'}
      >
        <ProviderForm
          initialData={editingProvider || undefined}
          onSubmit={handleFormSubmit}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
