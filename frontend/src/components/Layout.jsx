import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { FilePlus2, LayoutDashboard, ListChecks, Menu, Video, X } from 'lucide-react'

const NAV = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  { to: '/submit', label: 'Submit complaint', Icon: FilePlus2 },
  { to: '/complaints', label: 'Complaints', Icon: ListChecks },
  { to: '/video-review', label: 'Video review', Icon: Video },
]

export default function Layout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // close the mobile menu after navigating
  useEffect(() => setOpen(false), [location.pathname])

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar-top">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              CivicFlow <span className="brand-sub">PBA</span>
            </span>
          </div>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={open}
            aria-controls="primary-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>

        <nav id="primary-nav" aria-label="Main">
          <ul>
            {NAV.map(({ to, label, Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <Icon size={19} aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <p className="sidebar-note">Complaints are ranked automatically, from 0 to 100, so urgent problems are seen first.</p>
      </aside>

      <main id="main" className="main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
