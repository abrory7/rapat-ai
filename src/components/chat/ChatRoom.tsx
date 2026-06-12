'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { MessageSquare, AlertTriangle, ClipboardList, Play, Pause, Square, RotateCcw, Download, Target, ChevronLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { markdownSanitizeSchema, renderLink } from './markdown-policy';
import Button from '../ui/Button';
import MessageBubble from './MessageBubble';
import StreamingMessage from './StreamingMessage';
import styles from './ChatRoom.module.css';
import bubbleStyles from './MessageBubble.module.css';

interface Role {
  name: string;
  slug: string;
  icon: string;
  color: string;
}

interface Message {
  id: string;
  sender: string;
  content: string;
  toolCalls?: string | null;
  delegateTo?: string | null;
  createdAt: string;
}

interface Session {
  id: string;
  projectId: string;
  topic: string;
  status: string;
  currentRoleSlug?: string | null;
  currentRound: number;
  planningDocument?: string | null;
  template: {
    name: string;
    maxRounds: number;
    templateRoles: { role: Role }[];
  };
}

interface ChatRoomProps {
  sessionId: string;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({ sessionId }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState('IDLE');
  
  // Streaming state
  const [activeSpeaker, setActiveSpeaker] = useState<{ name: string; icon: string; color: string } | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchSessionDetails = async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setSession(data);
        setMessages(data.messages || []);
        setStatus(data.status);
      }
    } catch (e) {
      console.error('Failed to fetch session details:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSessionDetails();
    // Initial load intentionally follows sessionId changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Connect to SSE stream
  useEffect(() => {
    if (status === 'RUNNING' || status === 'COMPILING') {
      if (eventSourceRef.current) return; // Already connected

      console.log('Connecting to SSE orchestration stream...');
      const eventSource = new EventSource(`/api/orchestrate?sessionId=${sessionId}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'turn-start') {
            const role = session?.template.templateRoles.find(
              (tr) => tr.role.slug === data.roleSlug
            )?.role;
            
            if (role) {
              setActiveSpeaker(role);
            } else {
              setActiveSpeaker({
                name: data.roleName || 'Agent',
                icon: '🤖',
                color: 'var(--accent-primary)',
              });
            }
            setStreamingContent('');
          } else if (data.type === 'text-chunk') {
            setStreamingContent((prev) => prev + data.chunk);
          } else if (data.type === 'turn-end') {
            setActiveSpeaker(null);
            setStreamingContent('');
            setMessages((prev) => [...prev, data.message]);
          } else if (data.type === 'transition') {
            setSession((prev) => prev ? {
              ...prev,
              currentRoleSlug: data.currentRoleSlug,
              currentRound: data.currentRound,
            } : null);
          } else if (data.type === 'status') {
            setStatus(data.status);
            setSession((prev) => prev ? {
              ...prev,
              status: data.status,
              currentRoleSlug: data.currentRoleSlug !== undefined ? data.currentRoleSlug : prev.currentRoleSlug,
              currentRound: data.currentRound !== undefined ? data.currentRound : prev.currentRound,
              planningDocument: data.document !== undefined ? data.document : prev.planningDocument,
            } : null);
          } else if (data.type === 'error') {
            console.error('Orchestration discussion error:', data.error);
            setStatus('ERROR');
            setSession((prev) => prev ? { ...prev, status: 'ERROR' } : null);
            fetchSessionDetails();
          }
        } catch (e) {
          console.error('Error parsing SSE event:', e);
        }
      };

      eventSource.onerror = (e) => {
        console.error('SSE connection error:', e);
        eventSource.close();
        eventSourceRef.current = null;
        fetchSessionDetails();
      };
    } else {
      // Disconnect if status is neither RUNNING nor COMPILING
      if (eventSourceRef.current) {
        console.log('Disconnecting SSE stream...');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveSpeaker(null);
      setStreamingContent('');
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [status, session, sessionId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, activeSpeaker]);

  const handleControlCommand = useCallback(async (command: 'start' | 'pause' | 'resume' | 'stop' | 'retry-compile') => {
    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, command }),
      });
      if (res.ok) {
        // Optimistically update status
        const nextStatusMap = {
          start: 'RUNNING',
          pause: 'PAUSED',
          resume: 'RUNNING',
          stop: 'COMPILING',
          'retry-compile': 'COMPILING',
        };
        const nextStatus = nextStatusMap[command];
        setStatus(nextStatus);
        setSession((prev) => prev ? { ...prev, status: nextStatus } : null);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to send command.');
      }
    } catch (e) {
      console.error(e);
      alert('Error sending command.');
    }
  }, [sessionId]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Cmd+Enter or Ctrl+Enter -> Start / Resume / Compile
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (status === 'IDLE') handleControlCommand('start');
        else if (status === 'PAUSED') handleControlCommand('resume');
        else if (status === 'RUNNING') handleControlCommand('stop');
      }
      
      // Spacebar -> Pause (if running)
      if (e.key === ' ' && status === 'RUNNING') {
        e.preventDefault();
        handleControlCommand('pause');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, handleControlCommand]);

  const handleDownloadDocument = () => {
    if (!session?.planningDocument) return;

    const blob = new Blob([session.planningDocument], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Clean topic name for file name
    const fileName = `${session.topic.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_plan.md`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading || !session) {
    return (
      <div style={{ textAlign: 'center', padding: 100, color: 'var(--text-secondary)' }}>
        Loading session room...
      </div>
    );
  }

  const registeredSlugs = session.template.templateRoles.map((tr) => tr.role.slug);
  const showDocument = status === 'COMPLETED' || !!session.planningDocument;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.topicInfo}>
          <h2>{session.topic}</h2>
          <div className={styles.topicMeta}>
            <Link href={`/project/${session.projectId}`} className={styles.backLink}>
              <ChevronLeft size={14} /> Project Details
            </Link>
            <span className={styles.metaDot}>•</span>
            <span className={styles.metaItem}><ClipboardList size={14} /> {session.template.name}</span>
            <span className={styles.metaDot}>•</span>
            <span className={styles.metaItem}>
              Round {session.currentRound}/{session.template.maxRounds}
            </span>
            <span className={styles.metaDot}>•</span>
            <span className={styles.statusWrapper}>
              <span className={`${styles.statusDot} ${status === 'RUNNING' || status === 'COMPILING' ? styles.running : status === 'PAUSED' ? styles.paused : status === 'ERROR' ? styles.error : ''}`} />
              <span className={styles.statusText}>{status}</span>
            </span>
          </div>
        </div>

        <div className={styles.controls}>
          {status === 'IDLE' && (
            <Button onClick={() => handleControlCommand('start')} variant="success">
              <Play size={14} style={{ marginRight: 6 }} fill="currentColor" /> Start Discussion
            </Button>
          )}

          {status === 'RUNNING' && (
            <>
              <Button onClick={() => handleControlCommand('pause')} variant="secondary">
                <Pause size={14} style={{ marginRight: 6 }} fill="currentColor" /> Pause
              </Button>
              <Button onClick={() => handleControlCommand('stop')} variant="danger">
                <Square size={14} style={{ marginRight: 6 }} fill="currentColor" /> Compile Now
              </Button>
            </>
          )}

          {status === 'PAUSED' && (
            <>
              <Button onClick={() => handleControlCommand('resume')} variant="success">
                <Play size={14} style={{ marginRight: 6 }} fill="currentColor" /> Resume
              </Button>
              <Button onClick={() => handleControlCommand('stop')} variant="danger">
                <Square size={14} style={{ marginRight: 6 }} fill="currentColor" /> Compile Now
              </Button>
            </>
          )}

          {status === 'COMPILING' && (
            <span className={styles.compilingText}>
              <RotateCcw size={14} className={styles.spinIcon} /> Compiling planning document...
            </span>
          )}

          {status === 'ERROR' && (
            <Button onClick={() => handleControlCommand('retry-compile')} variant="success">
              <RotateCcw size={14} style={{ marginRight: 6 }} /> Retry Compilation
            </Button>
          )}

          {showDocument && (
            <Button onClick={handleDownloadDocument} variant="primary">
              <Download size={14} style={{ marginRight: 6 }} /> Download Document (.md)
            </Button>
          )}
        </div>
      </header>

      <div className={styles.layout}>
        {/* Left: Chat history */}
        <div className={styles.chatPane}>
          <div className={styles.messagesList}>
            {messages.length === 0 && !activeSpeaker && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIconWrapper}>
                  <MessageSquare size={32} className={styles.emptyIcon} />
                </div>
                <h3>Room is ready</h3>
                <p>Click &quot;Start Discussion&quot; above to launch the autopilot agent discussion.</p>
              </div>
            )}

            {messages.map((msg) => {
              // Find role details if it's an agent message
              const roleDetails = session.template.templateRoles.find(
                (tr) => tr.role.name === msg.sender
              )?.role;

              return (
                <MessageBubble
                  key={msg.id}
                  sender={msg.sender}
                  senderSlug={roleDetails?.slug}
                  icon={roleDetails?.icon || (msg.sender === 'USER' ? '👤' : '🤖')}
                  color={roleDetails?.color || 'var(--text-secondary)'}
                  content={msg.content}
                  createdAt={msg.createdAt}
                  toolCalls={msg.toolCalls}
                  registeredSlugs={registeredSlugs}
                />
              );
            })}

            {/* Active Streaming turn */}
            {activeSpeaker && (
              <StreamingMessage
                senderName={activeSpeaker.name}
                senderIcon={activeSpeaker.icon}
                senderColor={activeSpeaker.color}
                content={streamingContent}
              />
            )}

            {/* Thinking / Preparing state during turn delay */}
            {status === 'RUNNING' && !activeSpeaker && session.currentRoleSlug && (() => {
              const nextRole = session.template.templateRoles.find(
                (tr) => tr.role.slug === session.currentRoleSlug
              )?.role;
              if (!nextRole) return null;
              return (
                <div 
                  className={`${bubbleStyles.bubble} ${bubbleStyles.thinkingBubble} animate-pulse-glow`} 
                  style={{ border: `1px solid ${nextRole.color || 'var(--border-color)'}`, backgroundColor: 'var(--bg-secondary)' }}
                >
                  <div className={bubbleStyles.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={bubbleStyles.icon}>{nextRole.icon || '🤖'}</span>
                      <span className={bubbleStyles.name}>{nextRole.name}</span>
                      <code className={bubbleStyles.slug}>@{nextRole.slug}</code>
                    </div>
                  </div>
                  <div className={bubbleStyles.content} style={{ fontStyle: 'italic', color: 'var(--text-tertiary)' }}>
                    <span>Analyzing discussion flow and preparing response...</span>
                  </div>
                </div>
              );
            })()}

            {/* System Alert Bubble when status is ERROR */}
            {status === 'ERROR' && (
              <div 
                className={`${bubbleStyles.bubble} ${bubbleStyles.system}`} 
                style={{ 
                  border: '1px solid var(--danger)', 
                  backgroundColor: 'rgba(239, 110, 110, 0.05)' 
                }}
              >
                <div className={bubbleStyles.header}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={bubbleStyles.icon}><AlertTriangle color="var(--danger)" size={18} /></span>
                    <span className={bubbleStyles.name} style={{ color: 'var(--danger)', fontWeight: 600 }}>Sistem Orkestrasi</span>
                  </div>
                </div>
                <div className={bubbleStyles.content} style={{ color: 'var(--text-secondary)' }}>
                  Gagal menyusun Dokumen Perencanaan (LLM mengembalikan respons kosong atau terjadi gangguan jaringan). Silakan klik tombol <strong>Retry Compilation</strong> di kanan atas untuk mencoba menyusun ulang.
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Right: Compiled Document Panel */}
        {showDocument && (
          <div className={styles.editorPane}>
            <div className={styles.documentHeader}>
              <h3 className={styles.documentTitle}><Target size={18} style={{ marginRight: 8, color: 'var(--accent-primary)' }} /> Compiled Planning Document</h3>
              <Button onClick={handleDownloadDocument} size="sm" variant="secondary">
                Download
              </Button>
            </div>

            <div className={styles.documentContent}>
              {session.planningDocument ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]}
                  components={{ a: renderLink }}
                >
                  {session.planningDocument}
                </ReactMarkdown>
              ) : (
                <p>Loading compiled document...</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatRoom;
