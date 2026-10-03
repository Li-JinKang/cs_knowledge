// Digital Garden 的 Excalidraw 渲染岛：只读挂载真实画布。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

window.DGExcalidraw = {
  mount(el, scene) {
    createRoot(el).render(
      React.createElement(Excalidraw, {
        initialData: {
          elements: scene.elements ?? [],
          // 只保留画布外观：.md 里存档的 zoom/scrollX/scrollY 会让画布停在上次
          // 编辑时的位置和缩放，视图交给下面的 scrollToContent 适配。
          appState: {
            viewBackgroundColor: scene.appState?.viewBackgroundColor ?? '#ffffff',
            gridSize: null,
            collaborators: new Map(),
          },
          files: scene.files ?? {},
        },
        viewModeEnabled: true,
        zenModeEnabled: false,
        excalidrawAPI: (api) => {
          window.__dgApi = api;
          // 容器尺寸是异步量到的，太早适配算出来的缩放是错的，所以重试几次。
          const fit = () => {
            try {
              api.scrollToContent(api.getSceneElements(), {
                fitToViewport: true,
                viewportZoomFactor: 0.9,
                animate: false,
              });
            } catch {
              /* 画布还没就绪 */
            }
          };
          [200, 600, 1400].forEach((ms) => setTimeout(fit, ms));
        },
        // 画布里的 wikilink 在构建期被翻成了元素自己的 link，这里接管跳转：
        // 默认行为会开新标签页，笔记站里应当原地跳。
        onLinkOpen: (element, event) => {
          if (!element?.link) return;
          event?.preventDefault?.();
          window.location.href = element.link;
        },
      })
    );
  },
};
