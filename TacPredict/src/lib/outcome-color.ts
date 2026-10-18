/** A stable color per outcome, shared by cards and historical charts. */
export function outcomeColor(label: string, index: number) {
  if (/^(yes|up)$/i.test(label)) return "#55c875";
  if (/^(no|down)$/i.test(label)) return "#ff454f";
  return ["#19a397", "#197c9a", "#0089bd"][index % 3]!;
}
