import React from 'react';
import styles from './MessageBubble.module.css';

interface StreamingMessageProps {
  senderName: string;
  senderIcon: string;
  senderColor: string;
  content: string;
}

export const StreamingMessage: React.FC<StreamingMessageProps> = ({
  senderName,
  senderIcon,
  senderColor,
  content,
}) => {
  const isWaitingForFirstToken = !content || content.trim() === '';

  return (
    <div className={styles.bubble} style={{ borderLeft: `4px solid ${senderColor}` }}>
      <div className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={styles.icon}>{senderIcon}</span>
          <span className={styles.name}>{senderName}</span>
          <span className={styles.streamingBadge}>Streaming</span>
        </div>
      </div>
      <div className={styles.content} style={{ whiteSpace: 'pre-wrap' }}>
        {isWaitingForFirstToken ? (
          <div className={styles.typingIndicator} aria-label="Waiting for response">
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
          </div>
        ) : (
          <>
            {content}
            <span className={styles.cursor} />
          </>
        )}
      </div>
    </div>
  );
};

export default StreamingMessage;
