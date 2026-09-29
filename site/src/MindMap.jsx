import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Excalidraw, exportToBlob, exportToSvg } from '@excalidraw/excalidraw';
import baseScene from './scene.json';

const STORAGE_KEY = 'cs_knowledge:mindmap:v1';

/* ------------------------------------------------------------------ *
 * Persistence
 *
 * Edits live in localStorage only. GitHub Pages is static, so there is no
 * way to write back to the Obsidian vault -- the README says so explicitly
 * rather than letting people assume their changes are saved somewhere.
 * ------------------------------------------------------------------ */

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.elements) || parsed.elements.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    // Corrupt or from an incompatible version: drop it rather than render a
    // half-broken canvas.
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveScene(elements, appState, files) {
  try {
    // Only persist what is needed to redraw. appState holds a `collaborators`
    // Map and other transient values that JSON cannot represent.
    const slim = {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridSize: appState.gridSize ?? null,
      zoom: appState.zoom,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ elements, appState: slim, files: files ?? {} })
    );
    return true;
  } catch {
    // Quota exceeded on a large scene. Not fatal -- the page still works.
    return false;
  }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has definitely been handled.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function MindMap() {
  const apiRef = useRef(null);
  const saveTimer = useRef(null);
  const readyRef = useRef(false);

  const saved = useMemo(() => loadSaved(), []);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);

  const scene = saved ?? baseScene;

  const initialData = useMemo(
    () => ({
      type: 'excalidraw',
      version: 2,
      elements: scene.elements,
      appState: {
        viewBackgroundColor: scene.appState?.viewBackgroundColor ?? '#ffffff',
        gridSize: scene.appState?.gridSize ?? null,
      },
      files: scene.files ?? {},
    }),
    // Intentionally computed once: initialData only applies at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Obsidian persists its own scrollX/scrollY, which describe *its* viewport and
  // mean nothing here -- reusing them lands the camera in empty space.
  //
  // Fitting ALL content is also the wrong call for a mind map: a right-facing map
  // is far taller than it is wide, so "fit everything" collapses to ~10% zoom and
  // the labels become unreadable. Instead, frame the root node at a comfortable
  // zoom and let the reader pan outward.
  useEffect(() => {
    if (!ready) return;
    const api = apiRef.current;
    if (!api) return;

    const t = setTimeout(() => {
      const els = api.getSceneElements();
      if (!els.length) return;

      // The root of a right-facing map is the leftmost element. Using the
      // bounding box of the leftmost few elements gives a sensible anchor
      // without depending on MindMap Builder's internal node ids.
      let minX = Infinity;
      for (const el of els) if (el.x < minX) minX = el.x;
      const anchor = els.filter((el) => el.x < minX + 40);

      try {
        api.scrollToContent(anchor, { fitToContent: true, animate: false });
      } catch {
        /* not fatal -- the user can still pan */
      }
    }, 80);

    return () => clearTimeout(t);
  }, [ready]);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }, []);

  const onChange = useCallback((elements, appState, files) => {
    // Excalidraw fires onChange once during mount; only treat later calls as
    // real user edits, otherwise the "modified" badge shows on first load.
    if (!readyRef.current) {
      readyRef.current = true;
      return;
    }
    // Debounce: onChange fires on every pointer move while dragging.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (saveScene(elements, appState, files)) setDirty(true);
    }, 600);
  }, []);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setDirty(false);
    // initialState only applies on mount, so a reload is the honest way to
    // restore the committed scene.
    window.location.reload();
  };

  const currentScene = () => {
    const api = apiRef.current;
    if (!api) return null;
    return {
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
    };
  };

  const exportPng = async () => {
    const s = currentScene();
    if (!s) return;
    try {
      const blob = await exportToBlob({
        elements: s.elements,
        appState: { ...s.appState, exportBackground: true },
        files: s.files,
        mimeType: 'image/png',
        quality: 1,
        // 2x keeps Chinese glyphs crisp when the image is opened full size.
        exportScale: 2,
        getDimensions: (w, h) => ({ width: w, height: h, scale: 1 }),
      });
      download(blob, '思维导图.png');
      notify('已导出 PNG');
    } catch (err) {
      notify('PNG 导出失败：' + err.message);
    }
  };

  const exportSvg = async () => {
    const s = currentScene();
    if (!s) return;
    try {
      const svg = await exportToSvg({
        elements: s.elements,
        appState: { ...s.appState, exportBackground: true },
        files: s.files,
      });
      const text = new XMLSerializer().serializeToString(svg);
      download(new Blob([text], { type: 'image/svg+xml' }), '思维导图.svg');
      notify('已导出 SVG');
    } catch (err) {
      notify('SVG 导出失败：' + err.message);
    }
  };

  const exportJson = () => {
    const s = currentScene();
    if (!s) return;
    const payload = {
      type: 'excalidraw',
      version: 2,
      source: 'cs_knowledge',
      elements: s.elements,
      appState: {
        viewBackgroundColor: s.appState.viewBackgroundColor,
        gridSize: s.appState.gridSize ?? null,
      },
      files: s.files,
    };
    download(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      '思维导图.excalidraw'
    );
    notify('已导出 .excalidraw');
  };

  const counts = `${(scene.elements ?? []).length} 个元素`;

  return (
    <div className="map-wrap">
      <div className="map-bar">
        <span>Android 知识体系 · {counts}</span>
        <span className="spacer" />
        {dirty && <span title="本地修改仅保存在此浏览器">● 本地已修改</span>}
        <button
          className={editing ? 'on' : ''}
          onClick={() => setEditing((v) => !v)}
          title="解锁后可以拖动节点、改文字、加图形"
        >
          {editing ? '编辑中' : '浏览模式'}
        </button>
        <button onClick={exportPng}>PNG</button>
        <button onClick={exportSvg}>SVG</button>
        <button onClick={exportJson}>.excalidraw</button>
        {dirty && <button onClick={handleReset}>重置</button>}
        {toast && <span>{toast}</span>}
      </div>
      <div className="map-canvas">
        <Excalidraw
          initialData={initialData}
          viewModeEnabled={!editing}
          onChange={onChange}
          excalidrawAPI={(api) => {
            apiRef.current = api;
            // Exposed for end-to-end tests (tools/verify.mjs) to inspect the
            // live scene. Harmless in production.
            window.__excalidrawAPI = api;
            if (api) setReady(true);
          }}
          langCode="zh-CN"
        />
      </div>
    </div>
  );
}
