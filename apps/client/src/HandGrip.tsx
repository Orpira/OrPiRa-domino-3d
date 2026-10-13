import { useId } from "react";
import { HAND_VIEWBOX, handMarkup } from "./hand-art.ts";

/** Mano que sujeta la ficha que la contiene (la ficha debe tener `position: relative`). */
export function HandGrip({ className = "" }: { className?: string }) {
  const clipId = `hand-clip-${useId().replace(/:/g, "")}`;
  return <svg className={`grip-hand ${className}`} viewBox={HAND_VIEWBOX} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: handMarkup(clipId) }}/>;
}
