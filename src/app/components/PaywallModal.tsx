import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Infinity as InfinityIcon, X, Loader2 } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const CHECKOUT_URL = `https://${projectId}.supabase.co/functions/v1/make-server-8474fcb9/create-checkout-session`;

interface Props {
  open: boolean;
  minutesUsed: number;
  onClose: () => void;
}

export function PaywallModal({ open, minutesUsed, onClose }: Props) {
  const [loading, setLoading] = useState<'credits' | 'subscription' | null>(null);

  const startCheckout = async (type: 'credits' | 'subscription') => {
    setLoading(type);
    try {
      const res = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      console.error('[Paywall] Checkout error:', err);
      setLoading(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{
              background: 'rgba(10,10,18,0.97)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 24,
              padding: '44px 48px',
              maxWidth: 460,
              width: '90vw',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.12)',
              position: 'relative',
            }}
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors"
              style={{ color: '#475569' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
              onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
            >
              <X size={16} />
            </button>

            {/* Icon */}
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{
                background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(99,102,241,0.1))',
                border: '1px solid rgba(124,58,237,0.35)',
              }}
            >
              <Zap size={24} style={{ color: '#A78BFA' }} />
            </div>

            <h2
              className="text-center text-white mb-2"
              style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}
            >
              You've used your {Math.floor(minutesUsed)} free minutes
            </h2>
            <p className="text-center mb-8" style={{ color: '#64748B', fontSize: 14, lineHeight: 1.6 }}>
              AI transcription takes a moment to recharge. Pick a plan to keep building.
            </p>

            {/* CTAs */}
            <div className="flex flex-col gap-3 mb-6">
              {/* Credits */}
              <button
                onClick={() => startCheckout('credits')}
                disabled={loading !== null}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all"
                style={{
                  background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                  boxShadow: '0 8px 24px rgba(124,58,237,0.35)',
                  opacity: loading !== null ? 0.7 : 1,
                }}
              >
                <div className="text-left">
                  <p className="text-white font-semibold" style={{ fontSize: 15 }}>
                    Buy 120 minutes
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>One-time · never expires</p>
                </div>
                <div className="flex items-center gap-2">
                  {loading === 'credits' ? (
                    <Loader2 size={16} className="animate-spin text-white" />
                  ) : null}
                  <span className="text-white font-bold" style={{ fontSize: 18 }}>$5</span>
                </div>
              </button>

              {/* Subscription */}
              <button
                onClick={() => startCheckout('subscription')}
                disabled={loading !== null}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  opacity: loading !== null ? 0.7 : 1,
                }}
                onMouseEnter={e => !loading && (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              >
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <InfinityIcon size={13} style={{ color: '#A78BFA' }} />
                    <p className="text-white font-semibold" style={{ fontSize: 15 }}>Unlimited</p>
                  </div>
                  <p style={{ color: '#64748B', fontSize: 12 }}>Monthly subscription · cancel anytime</p>
                </div>
                <div className="flex items-center gap-2">
                  {loading === 'subscription' ? (
                    <Loader2 size={16} className="animate-spin" style={{ color: '#A78BFA' }} />
                  ) : null}
                  <div className="text-right">
                    <span className="text-white font-bold" style={{ fontSize: 18 }}>$12</span>
                    <span style={{ color: '#64748B', fontSize: 11 }}>/mo</span>
                  </div>
                </div>
              </button>
            </div>

            <p className="text-center" style={{ color: '#334155', fontSize: 12 }}>
              All other Wingman features remain free forever.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
