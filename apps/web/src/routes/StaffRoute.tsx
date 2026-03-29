import { Navigate, Outlet } from 'react-router-dom';
import { isStaffSession, loadSession } from '../lib/session';

/** Só `owner` ou `collaborator` com sessão local válida. */
export function StaffRoute() {
  const s = loadSession();
  if (!isStaffSession(s)) return <Navigate to="/" replace />;
  return <Outlet />;
}
