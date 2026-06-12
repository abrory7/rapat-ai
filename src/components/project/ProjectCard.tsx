import React from 'react';
import Link from 'next/link';
import { FolderGit2 } from 'lucide-react';
import styles from './ProjectCard.module.css';

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string;
  repoPath: string;
  sessionCount: number;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  id,
  name,
  description,
  repoPath,
  sessionCount,
}) => {
  return (
    <Link href={`/project/${id}`} className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{name}</h3>
        <span className={styles.sessionBadge}>
          {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
        </span>
      </div>
      <p className={styles.description}>{description || 'No description provided.'}</p>
      <div className={styles.footer}>
        <FolderGit2 className={styles.folderIcon} size={16} />
        <span className={styles.path} title={repoPath}>
          {repoPath}
        </span>
      </div>
    </Link>
  );
};

export default ProjectCard;
