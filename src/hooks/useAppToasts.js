import { useCallback, useEffect, useRef, useState } from 'react';

export function useAppToasts() {
  const [toasts, setToasts] = useState([]);
  const toastTimersRef = useRef(new Map());
  const lastToastRef = useRef({ message: '', at: 0 });

  const pushToast = useCallback((message, level = 'info') => {
    if (!message) return;
    const now = Date.now();
    const normalizedMessage = String(message).trim();
    if (
      lastToastRef.current.message === normalizedMessage &&
      now - lastToastRef.current.at < 4000
    ) {
      return;
    }
    lastToastRef.current = { message: normalizedMessage, at: now };
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((previous) => [...previous.slice(-3), { id, message: normalizedMessage, level }]);
    const timer = setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
      toastTimersRef.current.delete(id);
    }, 5000);
    toastTimersRef.current.set(id, timer);
  }, []);

  useEffect(() => () => {
    toastTimersRef.current.forEach((timer) => clearTimeout(timer));
    toastTimersRef.current.clear();
  }, []);

  useEffect(() => {
    const handleWindowError = (event) => {
      pushToast(event?.message || 'Unexpected runtime error', 'error');
    };
    const handleUnhandledRejection = (event) => {
      const reasonMessage =
        event?.reason?.message
        || (typeof event?.reason === 'string' ? event.reason : 'Unhandled async error');
      pushToast(reasonMessage, 'error');
    };
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [pushToast]);

  return { toasts, pushToast };
}
