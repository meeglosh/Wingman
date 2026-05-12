import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { storeEntitlement, CREDITS_SECONDS } from '../hooks/useTranscriptionUsage';

const VERIFY_URL = `https://${projectId}.supabase.co/functions/v1/make-server-8474fcb9/verify-payment`;

type Status = 'verifying' | 'success' | 'error';

export default function PaymentSuccess() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const [status, setStatus]   = useState<Status>('verifying');
  const [errMsg,  setErrMsg]  = useState('');
  const [type,    setType]    = useState<'credits' | 'subscription' | null>(null);

  useEffect(() => {
    const sessionId = params.get('session_id');
    const rawType   = params.get('type') as 'credits' | 'subscription' | null;

    if (!sessionId || !rawType) {
      setErrMsg('Missing payment details in the URL.');
      setStatus('error');
      return;
    }

    setType(rawType);

    (async () => {
      try {
        const res = await fetch(VERIFY_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId }),
        });

        if (!res.ok) throw new Error(await res.text());
        const { valid } = await res.json();

        if (!valid) {
          setErrMsg('Payment could not be confirmed. If you were charged, please contact support.');
          setStatus('error');
          return;
        }

        // Persist entitlement locally
        if (rawType === 'credits') {
          storeEntitlement({ type: 'credits', grantedSeconds: CREDITS_SECONDS, purchasedAt: Date.now() });
        } else {
          storeEntitlement({ type: 'subscription', purchasedAt: Date.now() });
        }

        setStatus('success');
        setTimeout(() => navigate('/'), 4000);
      } catch (err) {
        setErrMsg(String(err));
        setStatus('error');
      }
    })();
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#08090E', fontFamily: '"Space Grotesk", system-ui, sans-serif' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="text-center"
        style={{
          background: 'rgba(12,12,20,0.95)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 24,
          padding: '52px 60px',
          maxWidth: 440,
          width: '90vw',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
      >
        {status === 'verifying' && (
          <>
            <div className="w-14 h-14 rounded-full border-2 border-purple-500 border-t-transparent animate-spin mx-auto mb-6" />
            <h2 className="text-white mb-2" style={{ fontSize: 22, fontWeight: 700 }}>
              Confirming payment…
            </h2>
            <p style={{ color: '#64748B', fontSize: 14 }}>Just a moment while we verify your purchase.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(124,58,237,0.1))',
                border: '1px solid rgba(16,185,129,0.3)',
              }}
            >
              <CheckCircle size={28} style={{ color: '#34D399' }} />
            </div>
            <h2 className="text-white mb-2" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {type === 'subscription' ? 'Welcome to Unlimited!' : '120 minutes added!'}
            </h2>
            <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              {type === 'subscription'
                ? 'Your subscription is active. Go build something great.'
                : 'Your 120 minutes are ready. Go build something great.'}
            </p>
            <motion.button
              onClick={() => navigate('/')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3.5 rounded-2xl text-base font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', boxShadow: '0 8px 24px rgba(124,58,237,0.35)' }}
            >
              Start speaking →
            </motion.button>
            <p className="mt-4" style={{ color: '#334155', fontSize: 12 }}>
              Redirecting automatically in a few seconds…
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.25)',
              }}
            >
              <AlertCircle size={28} style={{ color: '#F87171' }} />
            </div>
            <h2 className="text-white mb-2" style={{ fontSize: 22, fontWeight: 700 }}>
              Something went wrong
            </h2>
            <p style={{ color: '#64748B', fontSize: 13, lineHeight: 1.6, marginBottom: 28 }}>
              {errMsg || 'We could not confirm your payment. Please contact support if you were charged.'}
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3.5 rounded-2xl text-sm font-medium"
              style={{ background: 'rgba(255,255,255,0.07)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Back to home
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
