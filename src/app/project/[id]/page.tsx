'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare, FileText, RefreshCw, Clock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ProjectForm from '@/components/project/ProjectForm';
import McpServerForm from '@/components/project/McpServerForm';
import styles from '@/app/settings/Settings.module.css';
import formStyles from '@/components/settings/Form.module.css';
import detailStyles from './ProjectDetail.module.css';
import { toMcpMutationPayload } from '@/lib/mcp/request-payload';

interface McpServer {
  id: string;
  name: string;
  type: string;
  command?: string;
  url?: string;
  args?: string[];
  env?: Record<string, string | { hasValue: boolean }>;
  removedEnvKeys?: string[];
  enabled: boolean;
}

interface Session {
  id: string;
  topic: string;
  status: string;
  currentRound: number;
  createdAt: string;
  template: {
    name: string;
    maxRounds: number;
  };
}

interface Project {
  id: string;
  name: string;
  description?: string;
  repoPath: string;
  ignoreRules?: string;
  sessions: Session[];
  mcpServers: McpServer[];
}

interface Template {
  id: string;
  name: string;
  description?: string;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string>('');
  const [project, setProject] = useState<Project | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [activeModal, setActiveModal] = useState<'editProj' | 'addMcp' | 'editMcp' | 'startDiscussion' | null>(null);
  const [selectedMcp, setSelectedMcp] = useState<McpServer | null>(null);

  // Start discussion form state
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [discussionTopic, setDiscussionTopic] = useState('');

  // Search, Filter, and Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;



  // Loading states for submissions
  const [isStartingDiscussion, setIsStartingDiscussion] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [isDeletingMcp, setIsDeletingMcp] = useState(false);

  // Custom alert / confirmation modal state
  const [alertModal, setAlertModal] = useState<{ title: string; message: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    requireMatchText?: string;
    confirmText?: string;
  } | null>(null);
  const [confirmInputVal, setConfirmInputVal] = useState('');

  const showAlert = (title: string, message: string) => {
    setAlertModal({ title, message });
  };

  const fetchProject = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        setProject(await res.json());
      } else {
        router.push('/');
      }
    } catch (error) {
      console.error(error);
      router.push('/');
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        setTemplates(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    params.then((p) => {
      setProjectId(p.id);
      fetchProject(p.id);
      fetchTemplates();
      setIsLoading(false);
    });
  }, [params]);

  const handleEditProject = async (formData: {
    id?: string;
    name: string;
    description?: string;
    repoPath: string;
    ignoreRules?: string;
  }) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setActiveModal(null);
        fetchProject(projectId);
      } else {
        const err = await res.json();
        showAlert('Save Failed', err.error || 'Failed to update project.');
      }
    } catch (e) {
      console.error(e);
      showAlert('Save Error', 'Error updating project.');
    }
  };

  const handleDeleteProject = () => {
    if (!project) return;
    setConfirmModal({
      title: 'Delete Project',
      message: 'Are you sure you want to delete this project? All associated discussion sessions will be permanently deleted. This action cannot be undone.',
      requireMatchText: project.name,
      confirmText: 'Delete Project',
      onConfirm: async () => {
        setIsDeletingProject(true);
        try {
          const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
          if (res.ok) {
            setConfirmModal(null);
            setConfirmInputVal('');
            router.push('/');
          } else {
            showAlert('Error', 'Failed to delete project.');
          }
        } catch (e) {
          console.error(e);
          showAlert('Error', 'Error deleting project.');
        } finally {
          setIsDeletingProject(false);
        }
      }
    });
  };

  const handleMcpSubmit = async (formData: Omit<McpServer, 'id'> & { id?: string }) => {
    const isEdit = !!formData.id;
    const url = isEdit
      ? `/api/projects/${projectId}/mcp-servers/${formData.id}`
      : `/api/projects/${projectId}/mcp-servers`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toMcpMutationPayload(formData, isEdit)),
      });

      if (res.ok) {
        setActiveModal(null);
        fetchProject(projectId);
      } else {
        const err = await res.json();
        showAlert('Save Failed', err.error || 'Failed to save MCP config.');
      }
    } catch (e) {
      console.error(e);
      showAlert('Save Error', 'Error saving MCP config.');
    }
  };

  const handleDeleteMcp = (serverId: string) => {
    const serverName = project?.mcpServers.find((s) => s.id === serverId)?.name || 'this MCP server';
    setConfirmModal({
      title: 'Remove MCP Server',
      message: `Are you sure you want to remove the MCP server "${serverName}"?`,
      confirmText: 'Remove',
      onConfirm: async () => {
        setIsDeletingMcp(true);
        try {
          const res = await fetch(`/api/projects/${projectId}/mcp-servers/${serverId}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            setConfirmModal(null);
            fetchProject(projectId);
          } else {
            showAlert('Error', 'Failed to delete MCP server.');
          }
        } catch (e) {
          console.error(e);
          showAlert('Error', 'Error deleting MCP server.');
        } finally {
          setIsDeletingMcp(false);
        }
      }
    });
  };

  const handleStartDiscussion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId || !discussionTopic.trim()) {
      showAlert('Validation Error', 'Please select a template and enter a topic.');
      return;
    }

    setIsStartingDiscussion(true);
    try {
      // Create session
      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          templateId: selectedTemplateId,
          topic: discussionTopic.trim(),
        }),
      });

      if (sessionRes.ok) {
        const session = await sessionRes.json();
        setActiveModal(null);
        // Redirect to chat room
        router.push(`/project/${projectId}/session/${session.id}`);
      } else {
        const err = await sessionRes.json();
        showAlert('Error', err.error || 'Failed to start discussion.');
      }
    } catch (error) {
      console.error(error);
      showAlert('Error', 'Error starting discussion.');
    } finally {
      setIsStartingDiscussion(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status.toUpperCase()) {
      case 'RUNNING':
        return detailStyles.statusRunning;
      case 'COMPLETED':
        return detailStyles.statusCompleted;
      case 'ERROR':
        return detailStyles.statusError;
      case 'PAUSED':
        return detailStyles.statusPaused;
      default:
        return detailStyles.statusIdle;
    }
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (isLoading || !project) {
    return (
      <div style={{ textAlign: 'center', padding: 100, color: 'var(--text-secondary)' }}>
        Loading project details...
      </div>
    );
  }

  // Filter and Paginate sessions
  const filteredSessions = (project?.sessions || []).filter((s) => {
    const matchesSearch = s.topic.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || s.status.toUpperCase() === statusFilter.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  const totalItems = filteredSessions.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
  const paginatedSessions = filteredSessions.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.navLink}>
        &larr; Back to Dashboard
      </Link>

      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>{project.name}</h1>
          <span className={styles.subtitle}>{project.description || 'No description.'}</span>
        </div>
        <div className={detailStyles.headerActions}>
          <Button onClick={() => setActiveModal('editProj')} variant="secondary">
            Edit Project
          </Button>
          <Button onClick={() => setActiveModal('startDiscussion')} variant="primary">
            + Start Discussion
          </Button>
        </div>
      </div>

      <div className={detailStyles.topRow}>
          <div className={detailStyles.panel}>
            <h3 className={`${detailStyles.panelTitle} ${detailStyles.panelTitleMarginMd}`}>
              Project Info
            </h3>

            <div className={detailStyles.infoField}>
              <span className={detailStyles.infoLabel}>Local Path</span>
              <span className={detailStyles.infoValue}>{project.repoPath}</span>
            </div>

            {project.ignoreRules && (
              <div className={detailStyles.infoField}>
                <span className={detailStyles.infoLabel}>Ignore Rules</span>
                <pre className={detailStyles.infoValueCode}>{project.ignoreRules}</pre>
              </div>
            )}

            <Button
              onClick={handleDeleteProject}
              variant="danger"
              size="sm"
              className={detailStyles.deleteButton}
            >
              Delete Project
            </Button>
          </div>

          <div className={detailStyles.panel}>
            <div className={detailStyles.panelHeader}>
              <h3 className={detailStyles.panelTitle}>MCP Servers</h3>
              <Button onClick={() => setActiveModal('addMcp')} variant="secondary" size="sm">
                + Add
              </Button>
            </div>

            {project.mcpServers.length === 0 ? (
              <p className={detailStyles.mcpEmptyText}>
                No custom MCP servers configured. Built-in workspace tools (file reader, lister, searcher) are enabled by default.
              </p>
            ) : (
              project.mcpServers.map((s) => (
                <div key={s.id} className={detailStyles.mcpCard}>
                  <div className={detailStyles.mcpLeftCol}>
                    <div className={detailStyles.mcpName}>
                      <span
                        className={detailStyles.statusDot}
                        style={{
                          backgroundColor: s.enabled ? 'var(--success)' : 'var(--text-tertiary)',
                          boxShadow: s.enabled ? '0 0 8px var(--success)' : 'none',
                        }}
                        aria-label={s.enabled ? 'Active MCP Server' : 'Inactive MCP Server'}
                        title={s.enabled ? 'Active' : 'Inactive'}
                      />
                      {s.name}
                    </div>
                    <div className={detailStyles.mcpMeta}>
                      {s.type === 'stdio'
                        ? `stdio: ${s.command} ${(s.args || []).slice(0, 2).join(' ')}`
                        : `sse: ${s.url}`}
                    </div>
                  </div>

                  <div className={detailStyles.mcpActions}>
                    <button
                      onClick={() => {
                        setSelectedMcp(s);
                        setActiveModal('editMcp');
                      }}
                      className={detailStyles.mcpEditBtn}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteMcp(s.id)}
                      className={detailStyles.mcpDeleteBtn}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bottom row: Sessions list */}
        <div className={detailStyles.panel}>
          <h3 className={`${detailStyles.panelTitle} ${detailStyles.panelTitleMarginLg}`}>
            Discussion Sessions
          </h3>

          {project.sessions.length > 0 && (
            <div className={detailStyles.sessionsToolbar}>
              <input
                type="text"
                placeholder="Search discussions..."
                className={detailStyles.searchInput}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
              <div className={detailStyles.filterTabs}>
                {['ALL', 'RUNNING', 'COMPLETED', 'ERROR', 'PAUSED'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`${detailStyles.filterTab} ${
                      statusFilter === status ? detailStyles.filterTabActive : ''
                    }`}
                    onClick={() => {
                      setStatusFilter(status);
                      setCurrentPage(1);
                    }}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          )}

          {project.sessions.length === 0 ? (
            <div className={detailStyles.sessionEmptyState}>
              <MessageSquare className={detailStyles.sessionEmptyIcon} />
              <h4 className={detailStyles.sessionEmptyTitle}>No Discussions Yet</h4>
              <p className={detailStyles.sessionEmptyDesc}>
                Kick off your first orchestrated AI discussion on a feature, bug, or concept.
              </p>
              <Button onClick={() => setActiveModal('startDiscussion')} size="sm">
                Start Discussion
              </Button>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className={detailStyles.sessionEmptyState}>
              <MessageSquare className={detailStyles.sessionEmptyIcon} />
              <h4 className={detailStyles.sessionEmptyTitle}>No Matches Found</h4>
              <p className={detailStyles.sessionEmptyDesc}>
                {"Try adjusting your search query or status filters to find what you're looking for."}
              </p>
              <Button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setCurrentPage(1);
                }}
                size="sm"
                variant="secondary"
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <>
              <div className={detailStyles.sessionsGrid}>
                {paginatedSessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/project/${projectId}/session/${s.id}`}
                  className={detailStyles.sessionCard}
                >
                  <div className={detailStyles.sessionCardHeader}>
                    <h4 className={detailStyles.sessionTopic}>{s.topic}</h4>
                    <span className={`${detailStyles.statusBadge} ${getStatusBadgeClass(s.status)}`}>
                      <span className={detailStyles.statusDotInner} />
                      {s.status}
                    </span>
                  </div>

                  <div className={detailStyles.sessionMeta}>
                    <span className={detailStyles.sessionMetaItem}>
                      <FileText className={detailStyles.sessionMetaIcon} />
                      {s.template.name}
                    </span>
                    <span className={detailStyles.sessionMetaItem}>
                      <RefreshCw className={detailStyles.sessionMetaIcon} />
                      Rounds: {s.currentRound}/{s.template.maxRounds}
                    </span>
                    <span className={detailStyles.sessionMetaItem}>
                      <Clock className={detailStyles.sessionMetaIcon} />
                      {getRelativeTime(s.createdAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

              {totalPages > 1 && (
                <div className={detailStyles.paginationContainer}>
                  <span>
                    Showing {startIndex + 1}–{endIndex} of {totalItems} discussions
                  </span>
                  <div className={detailStyles.paginationActions}>
                    <button
                      type="button"
                      className={detailStyles.paginationButton}
                      onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className={detailStyles.paginationButton}
                      onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      {/* Modals */}
      <Modal
        isOpen={activeModal === 'editProj'}
        onClose={() => setActiveModal(null)}
        title="Edit Project"
      >
        <ProjectForm
          initialData={project}
          onSubmit={handleEditProject}
          onCancel={() => setActiveModal(null)}
        />
      </Modal>

      <Modal
        isOpen={activeModal === 'addMcp'}
        onClose={() => setActiveModal(null)}
        title="Add MCP Server"
      >
        <McpServerForm
          onSubmit={handleMcpSubmit}
          onCancel={() => setActiveModal(null)}
        />
      </Modal>

      <Modal
        isOpen={activeModal === 'editMcp'}
        onClose={() => {
          setActiveModal(null);
          setSelectedMcp(null);
        }}
        title="Edit MCP Server"
      >
        {selectedMcp && (
          <McpServerForm
            initialData={selectedMcp}
            onSubmit={handleMcpSubmit}
            onCancel={() => {
              setActiveModal(null);
              setSelectedMcp(null);
            }}
          />
        )}
      </Modal>

      <Modal
        isOpen={activeModal === 'startDiscussion'}
        onClose={() => setActiveModal(null)}
        title="Start New Discussion"
      >
        <form onSubmit={handleStartDiscussion}>
          <div className={formStyles.formGroup}>
            <label className={formStyles.label}>Select Lineup Template *</label>
            <select
              className={formStyles.select}
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              required
              disabled={isStartingDiscussion}
            >
              <option value="">-- Choose Template --</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className={formStyles.formGroup}>
            <label className={formStyles.label}>Discussion Topic *</label>
            <textarea
              className={formStyles.textarea}
              rows={4}
              placeholder="What are we planning? Provide details like feature descriptions, bugs, user stories, or open architecture decisions..."
              value={discussionTopic}
              onChange={(e) => setDiscussionTopic(e.target.value)}
              required
              disabled={isStartingDiscussion}
            />
          </div>

          <div className={formStyles.actions}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setActiveModal(null)}
              disabled={isStartingDiscussion}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isStartingDiscussion}>
              Launch Session
            </Button>
          </div>
        </form>
      </Modal>

      {/* Custom Alert Modal */}
      <Modal
        isOpen={alertModal !== null}
        onClose={() => setAlertModal(null)}
        title={alertModal?.title || 'Alert'}
      >
        <p className={detailStyles.confirmModalText}>{alertModal?.message}</p>
        <div className={detailStyles.confirmModalActions}>
          <Button onClick={() => setAlertModal(null)} variant="primary">
            OK
          </Button>
        </div>
      </Modal>

      {/* Custom Confirm Modal */}
      <Modal
        isOpen={confirmModal !== null}
        onClose={() => {
          if (isDeletingProject || isDeletingMcp) return;
          setConfirmModal(null);
          setConfirmInputVal('');
        }}
        title={confirmModal?.title || 'Confirm Action'}
      >
        <p className={detailStyles.confirmModalText}>{confirmModal?.message}</p>
        
        {confirmModal?.requireMatchText && (
          <div className={detailStyles.confirmModalInputGroup}>
            <label className={detailStyles.confirmModalLabel}>
              Please type <strong>{confirmModal.requireMatchText}</strong> to confirm:
            </label>
            <input
              type="text"
              className={detailStyles.confirmModalInput}
              value={confirmInputVal}
              onChange={(e) => setConfirmInputVal(e.target.value)}
              placeholder={confirmModal.requireMatchText}
              disabled={isDeletingProject || isDeletingMcp}
            />
          </div>
        )}

        <div className={detailStyles.confirmModalActions}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setConfirmModal(null);
              setConfirmInputVal('');
            }}
            disabled={isDeletingProject || isDeletingMcp}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={
              confirmModal?.title.toLowerCase().includes('delete') ||
              confirmModal?.title.toLowerCase().includes('remove')
                ? 'danger'
                : 'primary'
            }
            onClick={() => {
              if (confirmModal?.requireMatchText && confirmInputVal !== confirmModal.requireMatchText) {
                return;
              }
              confirmModal?.onConfirm();
            }}
            disabled={
              (confirmModal?.requireMatchText ? confirmInputVal !== confirmModal.requireMatchText : false) ||
              isDeletingProject ||
              isDeletingMcp
            }
            isLoading={isDeletingProject || isDeletingMcp}
          >
            {confirmModal?.confirmText || 'Confirm'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
