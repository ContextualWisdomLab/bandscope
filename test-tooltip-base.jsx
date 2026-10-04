import * as React from "react"
import { renderToString } from "react-dom/server"
import { Tooltip, TooltipContent, TooltipTrigger } from "./apps/desktop/src/components/ui/tooltip"
import { Button } from "./apps/desktop/src/components/ui/button"

console.log(renderToString(
  <Tooltip>
    <TooltipTrigger render={<Button variant="outline" size="icon" />}>
      <span>Icon</span>
    </TooltipTrigger>
    <TooltipContent>Explanation</TooltipContent>
  </Tooltip>
))
