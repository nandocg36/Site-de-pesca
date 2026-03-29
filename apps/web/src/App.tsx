import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminDuesPage } from './pages/admin/AdminDuesPage';
import { AdminPresencePage } from './pages/admin/AdminPresencePage';
import { FeedPage } from './pages/FeedPage';
import { HomeMarco1 } from './pages/HomeMarco1';
import { InstallPwaPage } from './pages/InstallPwaPage';
import { InvitePage } from './pages/InvitePage';
import { MemberCheckinCodePage } from './pages/MemberCheckinCodePage';
import { MemberDuesPage } from './pages/MemberDuesPage';
import { StaffRoute } from './routes/StaffRoute';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeMarco1 />} />
      <Route path="/instalar-pwa" element={<InstallPwaPage />} />
      <Route path="/convite" element={<InvitePage />} />
      <Route path="/feed" element={<FeedPage />} />
      <Route path="/carteirinha" element={<MemberCheckinCodePage />} />
      <Route path="/mensalidade" element={<MemberDuesPage />} />
      <Route path="/admin" element={<StaffRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="presenca" element={<AdminPresencePage />} />
          <Route path="mensalidade" element={<AdminDuesPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
