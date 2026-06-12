'use client';

import React, { useState } from 'react';
import Button from '../ui/Button';
import styles from '../settings/Form.module.css';

interface McpServerData {
  id?: string;
  name: string;
  type: string;
  command?: string;
  url?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

interface McpServerFormProps {
  initialData?: McpServerData;
  onSubmit: (data: McpServerData) => Promise<void>;
  onCancel: () => void;
}

export const McpServerForm: React.FC<McpServerFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [type, setType] = useState(initialData?.type || 'stdio');
  const [command, setCommand] = useState(initialData?.command || '');
  const [url, setUrl] = useState(initialData?.url || '');
  const [argsInput, setArgsInput] = useState(
    initialData?.args ? initialData.args.join(' ') : ''
  );
  
  // Format environment variables from Record<string, string> to string formatted as KEY=VAL\nKEY2=VAL2
  const formatEnv = (envObj?: Record<string, string>): string => {
    if (!envObj) return '';
    return Object.entries(envObj)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
  };

  const [envInput, setEnvInput] = useState(formatEnv(initialData?.env));
  const [enabled, setEnabled] = useState(
    initialData?.enabled !== undefined ? initialData.enabled : true
  );
  const [isLoading, setIsLoading] = useState(false);

  const parseEnv = (text: string): Record<string, string> => {
    const lines = text.split('\n');
    const result: Record<string, string> = {};
    for (const line of lines) {
      if (line.trim() && line.includes('=')) {
        const index = line.indexOf('=');
        const k = line.substring(0, index).trim();
        const v = line.substring(index + 1).trim();
        if (k) result[k] = v;
      }
    }
    return result;
  };

  const parseArgs = (text: string): string[] => {
    // Split by spaces but respect quotes (very simple regex match or split)
    // Matches words or quoted strings
    const matches = text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
    if (!matches) return [];
    return matches.map((m) => {
      if ((m.startsWith('"') && m.endsWith('"')) || (m.startsWith("'") && m.endsWith("'"))) {
        return m.substring(1, m.length - 1);
      }
      return m;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('MCP Server Name is required.');
      return;
    }

    if (type === 'stdio' && !command.trim()) {
      alert('Command is required for stdio server type.');
      return;
    }

    if (type === 'sse' && !url.trim()) {
      alert('URL is required for SSE server type.');
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({
        id: initialData?.id,
        name: name.trim(),
        type,
        command: type === 'stdio' ? command.trim() : undefined,
        url: type === 'sse' ? url.trim() : undefined,
        args: type === 'stdio' ? parseArgs(argsInput) : undefined,
        env: type === 'stdio' ? parseEnv(envInput) : undefined,
        enabled,
      });
    } catch (err) {
      console.error(err);
      alert('Failed to save MCP server configuration.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className={styles.row}>
        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
          <label className={styles.label}>Server Name *</label>
          <input
            type="text"
            className={styles.input}
            placeholder="e.g. PostgreSQL Schema MCP, DevTools"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
          <label className={styles.label}>Connection Type *</label>
          <select
            className={styles.select}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="stdio">stdio (Local command)</option>
            <option value="sse">SSE (HTTP endpoint)</option>
          </select>
        </div>
      </div>

      {type === 'stdio' ? (
        <>
          <div className={styles.row}>
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label className={styles.label}>Executable Command *</label>
              <input
                type="text"
                className={styles.input}
                placeholder="e.g. npx, node, python, uvx"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                required
              />
              <span className={styles.helperText}>Executable command run on the shell.</span>
            </div>

            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label className={styles.label}>Arguments (Space-separated)</label>
              <input
                type="text"
                className={styles.input}
                placeholder="e.g. -y @modelcontextprotocol/server-postgres --db-url ..."
                value={argsInput}
                onChange={(e) => setArgsInput(e.target.value)}
              />
              <span className={styles.helperText}>CLI arguments. Quotes will be stripped.</span>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Environment Variables (KEY=VALUE, one per line)</label>
            <textarea
              className={styles.textarea}
              rows={4}
              placeholder="e.g.&#10;DATABASE_URL=postgresql://localhost/db&#10;DEBUG=mcp:*"
              value={envInput}
              onChange={(e) => setEnvInput(e.target.value)}
            />
            <span className={styles.helperText}>Extra environment variables for this process.</span>
          </div>
        </>
      ) : (
        <div className={styles.formGroup}>
          <label className={styles.label}>SSE URL Endpoint *</label>
          <input
            type="text"
            className={styles.input}
            placeholder="e.g. http://localhost:3001/sse"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <span className={styles.helperText}>The URL of the remote SSE MCP server.</span>
        </div>
      )}

      <div
        className={styles.formGroup}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          border: '1px solid var(--border-color)',
          padding: 12,
          borderRadius: 6,
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        <input
          type="checkbox"
          id="enabled-toggle"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{ cursor: 'pointer', width: 18, height: 18 }}
        />
        <label htmlFor="enabled-toggle" style={{ cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>
          Enable this MCP Server for discussions
        </label>
      </div>

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isLoading}>
          {initialData ? 'Save Server' : 'Add Server'}
        </Button>
      </div>
    </form>
  );
};

export default McpServerForm;
