'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  clearNotices,
  markAllRead,
  readNotices,
  unreadCount,
  type Notice,
} from '@/lib/notifications/notifications';

export function useNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    const sync = () => setNotices(readNotices());
    sync();
    window.addEventListener('tete:notices-changed', sync);
    return () => window.removeEventListener('tete:notices-changed', sync);
  }, []);

  return {
    notices,
    unread: unreadCount(notices),
    markRead: useCallback(() => setNotices(markAllRead()), []),
    clear: useCallback(() => setNotices(clearNotices()), []),
  };
}
