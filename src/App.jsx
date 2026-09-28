import { Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured, SITE_NAME } from './lib/supabase';
import { AuthProvider, useAuth } from './lib/auth';
import Layout from './components/Layout';
import Logo from './components/Logo';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import ClaimId from './pages/ClaimId';
import Pending from './pages/Pending';
import Feed from './pages/Feed';
import Events from './pages/Events';
import Members from './pages/Members';
import Profile from './pages/Profile';
import Messages from './pages/Messages';
import Admin from './pages/Admin';

export default function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const { session, profile, recovering } = useAuth();

  if (session === undefined || (session && profile === undefined)) {
    return (
      <div className="center-page" aria-label={`Loading ${SITE_NAME}`}>
        <Logo height={80} className="pulse" />
      </div>
    );
  }
  if (recovering && session) return <ResetPassword />;
  if (!session) return <Login />;
  if (!profile) return <ClaimId />;
  if (profile.status !== 'active') return <Pending />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Feed />} />
        <Route path="events" element={<Events />} />
        <Route path="members" element={<Members />} />
        <Route path="profile/:id" element={<Profile />} />
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:id" element={<Messages />} />
        {profile.is_admin && <Route path="admin" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function NotConfigured() {
  return (
    <div className="center-page">
      <div className="auth-card">
        <h1>Almost there</h1>
        <p>
          This site isn’t connected to its database yet. Create a file named <code>.env</code> in the project folder
          (copy <code>.env.example</code>), fill in your Supabase URL and public key, then restart with{' '}
          <code>npm run dev</code>. The README walks through it.
        </p>
      </div>
    </div>
  );
}
