import { NavLink, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          cs_knowledge
        </div>
        <nav>
          <NavLink to="/" end>
            思维导图
          </NavLink>
          <NavLink to="/docs">文档</NavLink>
          <a
            className="gh"
            href="https://github.com"
            target="_blank"
            rel="noreferrer noopener"
          >
            GitHub
          </a>
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
