import React from 'react';
import type { BadgeColor } from '../../types/admin';

export const STATUS_BADGE_MAP: Record<string, BadgeColor> = {
    pending:       'gray',
    in_progress:   'yellow',
    generating:    'yellow',
    generated:     'blue',
    danilo_review: 'blue',
    complete:      'blue',
    ready:         'blue',
    mentor_review: 'purple',
    revised:       'blue',
    submitted:     'green',
    approved:      'green',
    delivered:     'green',
};

export const BADGE_CLASSES: Record<BadgeColor, string> = {
    gray:   'bg-gray-600/20 text-gray-400',
    yellow: 'bg-yellow-600/20 text-yellow-400',
    blue:   'bg-blue-600/20 text-blue-400',
    purple: 'bg-purple-600/20 text-purple-400',
    green:  'bg-green-600/20 text-green-400',
};

export const StatusBadge: React.FC<{ status: string; label?: string }> = ({ status, label }) => {
    const color = STATUS_BADGE_MAP[status] ?? 'gray';
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${BADGE_CLASSES[color]}`}>
            {label ?? status}
        </span>
    );
};
