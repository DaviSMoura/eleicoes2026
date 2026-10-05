import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Tip({
  label,
  side = "right",
  children,
}: {
  label: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {/* Long explanations wrap instead of running off the screen. */}
      <TooltipContent
        side={side}
        collisionPadding={8}
        className="max-w-[260px] text-pretty leading-snug"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
