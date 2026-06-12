import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { markdownSanitizeSchema, renderLink } from './markdown-policy';
import ToolCallIndicator from './ToolCallIndicator';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  sender: string; // "Project Manager", "USER", "SYSTEM" etc.
  senderSlug?: string | null;
  icon: string;
  color: string;
  content: string;
  createdAt: string;
  toolCalls?: string | null;
  registeredSlugs: string[];
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  sender,
  senderSlug,
  icon,
  color,
  content,
  createdAt,
  toolCalls,
  registeredSlugs,
}) => {
  const isSystem = sender === 'SYSTEM';
  const isUser = sender === 'USER';

  const preprocessCustomTags = (text: string) => {
    let processed = text;

    // Thought process
    processed = processed.replace(
      /<thought>([\s\S]*?)<\/thought>/gi,
      '<details class="thoughtAccordion"><summary>✨ Analyzing discussion flow and preparing response...</summary><div class="thoughtContent">\n\n$1\n\n</div></details>'
    );
    processed = processed.replace(
      /<thinking>([\s\S]*?)<\/thinking>/gi,
      '<details class="thoughtAccordion"><summary>✨ Analyzing discussion flow and preparing response...</summary><div class="thoughtContent">\n\n$1\n\n</div></details>'
    );

    // Decisions & Parking lot
    processed = processed.replace(
      /(?:^|\n)\s*[-*]\s*\[DECISION\]\s*(.*?)(?=\n|$)/gi,
      '\n<div class="decisionBadge">🎯 Decision: $1</div>\n'
    );
    processed = processed.replace(
      /\[DECISION:\s*(.*?)\]/gi,
      '<div class="decisionBadge">🎯 Decision: $1</div>'
    );
    processed = processed.replace(
      /(?:^|\n)\s*[-*]\s*\[PARKING\s*LOT\]\s*(.*?)(?=\n|$)/gi,
      '\n<div class="parkingBadge">⏳ Parking Lot: $1</div>\n'
    );
    processed = processed.replace(
      /\[PARKING[-_]LOT:\s*(.*?)\]/gi,
      '<div class="parkingBadge">⏳ Parking Lot: $1</div>'
    );

    // Flags
    processed = processed.replace(
      /\[FLAG:\s*(.*?)\]/gi,
      '<div class="flagBadge">🚨 Flag: $1</div>'
    );

    // Signals
    processed = processed.replace(
      /\[READY TO CLOSE\]/gi,
      '<span class="signalBadge close">Ready to Close</span>'
    );
    processed = processed.replace(
      /\[NEEDS ONE MORE ROUND\]/gi,
      '<span class="signalBadge extra">Needs Another Round</span>'
    );

    // Mentions
    processed = processed.replace(/(^|\s)@([a-zA-Z0-9_-]+)/g, (match, prefix, slug) => {
      if (registeredSlugs.includes(slug.toLowerCase())) {
        return `${prefix}<span class="mention">@${slug}</span>`;
      }
      return match;
    });

    return processed;
  };

  let parsedTools: any[] = [];
  if (toolCalls) {
    try {
      const raw = JSON.parse(toolCalls);
      if (Array.isArray(raw)) {
        parsedTools = raw.map((tc: any) => {
          if (tc && tc.payload) {
            return {
              name: tc.payload.toolName || tc.payload.name || tc.toolName || tc.name,
              args: tc.payload.args || tc.payload.arguments || tc.args || tc.arguments,
              result: tc.payload.result || tc.result,
            };
          }
          return {
            name: tc.name || tc.toolName,
            args: tc.args || tc.arguments,
            result: tc.result,
          };
        });
      }
    } catch {
      parsedTools = [];
    }
  }

  let bubbleClass = styles.bubble;
  let borderStyle: React.CSSProperties = { 
    border: `1px solid ${color}`,
    backgroundColor: `color-mix(in srgb, ${color} 6%, transparent)`
  };

  if (isSystem) {
    bubbleClass = `${styles.bubble} ${styles.system}`;
    borderStyle = {};
  } else if (isUser) {
    bubbleClass = `${styles.bubble} ${styles.user}`;
    borderStyle = {};
  }

  const timeString = new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={bubbleClass} style={borderStyle}>
      <div className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={styles.icon}>{icon}</span>
          <span className={styles.name}>{sender}</span>
          {senderSlug && <code className={styles.slug}>@{senderSlug}</code>}
        </div>
        <span className={styles.time}>{timeString}</span>
      </div>

      <div className={styles.content}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]}
          components={{ a: renderLink }}
        >
          {preprocessCustomTags(content)}
        </ReactMarkdown>
      </div>

      {parsedTools.length > 0 && (
        <div className={styles.toolsContainer}>
          {parsedTools.map((tc, idx) => (
            <ToolCallIndicator
              key={idx}
              name={tc.name}
              args={tc.args}
              result={tc.result}
              status="completed"
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
