import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, CalendarDays, Users, MessageCircle, UserRound, ShieldCheck, LogOut } from 'lucide-react';
import { supabase, SITE_NAME } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Avatar from './Avatar';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import { roleLine } from '../lib/format';

export default function Layout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(async () => {
    const { data } = await supabase
      .from('conversation_members')
      .select('last_read_at, conversation:conversations(last_message_at)')
      .eq('user_id', profile.id);
    const n = (data || []).filter(
      (m) => m.conversation && new Date(m.conversation.last_message_at) > new Date(m.last_read_at)
    ).length;
    setUnread(n);
  }, [profile.id]);

  useEffect(() => {
    loadUnread();
  }, [loadUnread, location.pathname]);

  useEffect(() => {
    const onRead = () => loadUnread();
    window.addEventListener('messages-read', onRead);
    const channel = supabase
      .channel('unread-watch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => loadUnread())
      .subscribe();
    return () => {
      window.removeEventListener('messages-read', onRead);
      supabase.removeChannel(channel);
    };
  }, [loadUnread]);

  const links = [
    { to: '/', label: 'Feed', icon: Home, end: true },
    { to: '/events', label: 'Events', icon: CalendarDays },
    { to: '/members', label: 'Members', icon: Users },
    { to: '/messages', label: 'Messages', icon: MessageCircle, badge: unread },
    { to: `/profile/${profile.id}`, label: 'Profile', icon: UserRound },
  ];
  if (profile.is_admin) links.push({ to: '/admin', label: 'Admin', icon: ShieldCheck });

  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand-block" aria-label={`${SITE_NAME} home`}>
          <Logo height={56} />
          <span className="brand">{SITE_NAME}</span>
        </NavLink>
        <nav className="nav" aria-label="Main">
          {links.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink key={to} to={to} end={end} className="nav-link">
              <Icon size={20} aria-hidden="true" />
              <span className="nav-label">{label}</span>
              {badge > 0 && <span className="badge" aria-label={`${badge} unread`}>{badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-me">
          <Avatar person={profile} size={36} />
          <div className="sidebar-me-text">
            <strong>{profile.full_name}</strong>
            <span>{roleLine(profile)}</span>
          </div>
          <ThemeToggle />
          <button className="icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
