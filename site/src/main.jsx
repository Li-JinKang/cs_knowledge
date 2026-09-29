import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout.jsx';
import MindMap from './MindMap.jsx';
import DocsIndex from './DocsIndex.jsx';
import Doc from './Doc.jsx';
// Excalidraw ships its own stylesheet; without it the canvas renders unstyled.
import '@excalidraw/excalidraw/index.css';
import './styles.css';

// HashRouter rather than BrowserRouter: static hosting cannot rewrite unknown
// paths to index.html, so /docs/x would 404 on refresh. Hashes never reach the
// server, which is exactly what GitHub Pages needs.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<MindMap />} />
          <Route path="docs" element={<DocsIndex />} />
          <Route path="docs/*" element={<Doc />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
