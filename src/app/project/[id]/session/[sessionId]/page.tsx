'use client';

import React, { use } from 'react';
import ChatRoom from '@/components/chat/ChatRoom';

interface PageProps {
  params: Promise<{
    id: string;
    sessionId: string;
  }>;
}

export default function SessionRoomPage({ params }: PageProps) {
  const { sessionId } = use(params);
  return <ChatRoom sessionId={sessionId} />;
}
