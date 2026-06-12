'use client';

import React, { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewSessionRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  useEffect(() => {
    router.replace(`/project/${id}`);
  }, [id, router]);

  return (
    <div style={{ textAlign: 'center', padding: 100, color: 'var(--text-secondary)' }}>
      Redirecting to project page...
    </div>
  );
}
