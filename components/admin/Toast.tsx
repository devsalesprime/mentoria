import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ToastState } from '../../types/admin';

export const Toast: React.FC<{ toast: ToastState | null }> = ({ toast }) => (
    <AnimatePresence>
        {toast && (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-xl ${
                    toast.type === 'success'
                        ? 'bg-green-600/90 text-white'
                        : 'bg-red-600/90 text-white'
                }`}
            >
                {toast.message}
            </motion.div>
        )}
    </AnimatePresence>
);
