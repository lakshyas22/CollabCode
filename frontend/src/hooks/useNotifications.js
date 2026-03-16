import { useState, useCallback } from 'react';
let _id = 0;
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const push = useCallback((msg, type = 'success', duration = 3200) => {
    const id = ++_id;
    setNotifications(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), duration);
  }, []);
  const dismiss = useCallback((id) => setNotifications(prev => prev.filter(n => n.id !== id)), []);
  return { notifications, push, dismiss };
}
