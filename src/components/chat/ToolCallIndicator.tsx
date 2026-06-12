import React, { useState } from 'react';
import styles from './ToolCallIndicator.module.css';

interface ToolCallIndicatorProps {
  name: string;
  args: any;
  result?: any;
  status?: 'running' | 'completed' | 'error';
}

export const ToolCallIndicator: React.FC<ToolCallIndicatorProps> = ({
  name,
  args,
  result,
  status = 'completed',
}) => {
  const [expanded, setExpanded] = useState(false);

  const formatJSON = (val: any) => {
    try {
      if (typeof val === 'string') return val;
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  };

  return (
    <div className={`${styles.container} ${styles[status]}`}>
      <div className={styles.header} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {status === 'running' ? (
            <span className={styles.spinner} />
          ) : (
            <span className={styles.icon}>🔧</span>
          )}
          <span className={styles.name}>{name}</span>
        </div>
        <span className={styles.toggle}>{expanded ? '▲ Hide Details' : '▼ View Details'}</span>
      </div>

      {expanded && (
        <div className={styles.details}>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Arguments:</span>
            <pre className={styles.code}>{formatJSON(args)}</pre>
          </div>
          {result !== undefined && (
            <div className={styles.section} style={{ marginTop: 10 }}>
              <span className={styles.sectionLabel}>Result:</span>
              <pre className={styles.code}>{formatJSON(result)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolCallIndicator;
