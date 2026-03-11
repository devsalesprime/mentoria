import { useCallback, useRef } from 'react';
import axios from 'axios';

type BBEventType = 'bb_full_viewed' | 'expert_notes_viewed' | 'bb_full_download';

export function useAnalyticsTracker(token: string) {
  const recentEvents = useRef<Record<string, number>>({});

  const trackEvent = useCallback((eventType: BBEventType, eventData?: Record<string, any>) => {
    // Debounce duplicate events within 5s window
    const key = `${eventType}_${JSON.stringify(eventData || {})}`;
    const now = Date.now();
    if (recentEvents.current[key] && now - recentEvents.current[key] < 5000) return;
    recentEvents.current[key] = now;

    // Fire-and-forget — don't block UI
    axios.post('/api/analytics/bb-event', { eventType, eventData }, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => { /* silent — analytics should never block UX */ });
  }, [token]);

  return { trackEvent };
}
