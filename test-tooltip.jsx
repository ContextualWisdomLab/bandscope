import * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "./apps/desktop/src/components/ui/tooltip"
import { Button } from "./apps/desktop/src/components/ui/button"
import { renderToString } from "react-dom/server"

console.log(renderToString(
  <Tooltip>
    <TooltipTrigger render={<Button />}>
      Test
    </TooltipTrigger>
    <TooltipContent>Tooltip Text</TooltipContent>
  </Tooltip>
))
