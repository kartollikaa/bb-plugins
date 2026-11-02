import { useEffect, useState } from "react";

/** bb's bundled list; thread-tree draws its own GitHub folder, so only this one gets ours. */
const BB_THREAD_LIST = '[data-sidebar="content"] > [data-bb-plugin="thread-list"]';

/** A host element kept right above bb's own thread list, or null while that list isn't shown. */
export function useBbThreadListAnchor(pluginId: string): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const element = document.createElement("div");
    element.setAttribute("data-bb-plugin-root", "");
    element.setAttribute("data-bb-plugin", pluginId);
    element.setAttribute("data-github-folder-anchor", "");
    let frame = 0;

    const place = () => {
      frame = 0;
      const list = document.querySelector(BB_THREAD_LIST);
      if (!list) {
        if (element.isConnected) element.remove();
        setHost(null);
        return;
      }
      if (element.nextElementSibling !== list) list.before(element);
      setHost(element);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(place);
    };

    place();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
      element.remove();
    };
  }, [pluginId]);

  return host;
}
