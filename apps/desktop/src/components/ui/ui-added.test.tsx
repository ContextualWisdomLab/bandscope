import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Slider } from "./slider"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table"
import { Checkbox } from "./checkbox"
import { Switch } from "./switch"
import { RadioGroup, RadioGroupItem } from "./radio-group"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./accordion"
import { Label } from "./label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb"
import {
  StepIndicator,
  StepIndicatorMarker,
  StepItem,
  StepTitle,
} from "./step-indicator"
import {
  InPageNav,
  InPageNavItem,
  InPageNavLink,
  InPageNavList,
} from "./in-page-nav"
import { Toaster, toast } from "./sonner"

describe("added ui primitives (runtime render)", () => {
  it("Table renders header, row and cell", () => {
    const { container } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>구간</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>구간 1</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
    expect(container.querySelector('[data-slot="table"]')).toBeTruthy()
    expect(screen.getByText("구간 1")).toBeTruthy()
  })

  it("Checkbox mounts and shows indicator when checked", () => {
    const { container } = render(<Checkbox defaultChecked aria-label="c" />)
    const root = container.querySelector('[data-slot="checkbox"]')
    expect(root).toBeTruthy()
    expect(root?.getAttribute("data-checked")).not.toBeNull()
  })

  it("Switch mounts with a thumb", () => {
    const { container } = render(<Switch defaultChecked aria-label="s" />)
    expect(container.querySelector('[data-slot="switch"]')).toBeTruthy()
    expect(container.querySelector('[data-slot="switch-thumb"]')).toBeTruthy()
  })

  it("RadioGroup renders its items", () => {
    const { container } = render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" aria-label="a" />
        <RadioGroupItem value="b" aria-label="b" />
      </RadioGroup>
    )
    expect(container.querySelector('[data-slot="radio-group"]')).toBeTruthy()
    expect(
      container.querySelectorAll('[data-slot="radio-group-item"]')
    ).toHaveLength(2)
  })

  it("Accordion renders trigger and expanded panel content", () => {
    render(
      <Accordion defaultValue={["one"]}>
        <AccordionItem value="one">
          <AccordionTrigger>역할과 화성</AccordionTrigger>
          <AccordionContent>패널 내용</AccordionContent>
        </AccordionItem>
      </Accordion>
    )
    expect(screen.getByText("역할과 화성")).toBeTruthy()
    expect(screen.getByText("패널 내용")).toBeTruthy()
  })

  it("Label renders and associates via htmlFor", () => {
    const { container } = render(<Label htmlFor="x">이메일</Label>)
    const label = container.querySelector('[data-slot="label"]')
    expect(label).toBeTruthy()
    expect(label?.getAttribute("for")).toBe("x")
  })

  it("Dialog renders its content into a portal when open", async () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>삭제 확인</DialogTitle>
          <DialogDescription>되돌릴 수 없습니다.</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    await waitFor(() =>
      expect(screen.getByText("삭제 확인")).toBeTruthy()
    )
    expect(
      document.querySelector('[data-slot="dialog-content"]')
    ).toBeTruthy()
  })

  it("Select renders a trigger with its value", () => {
    const { container } = render(
      <Select defaultValue="section">
        <SelectTrigger aria-label="sel">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="section">구간</SelectItem>
        </SelectContent>
      </Select>
    )
    expect(
      container.querySelector('[data-slot="select-trigger"]')
    ).toBeTruthy()
  })

  it("Tooltip renders its trigger", () => {
    const { container } = render(
      <Tooltip>
        <TooltipTrigger>도움말</TooltipTrigger>
        <TooltipContent>이 화성이 먹히는 이유</TooltipContent>
      </Tooltip>
    )
    expect(
      container.querySelector('[data-slot="tooltip-trigger"]')
    ).toBeTruthy()
    expect(screen.getByText("도움말")).toBeTruthy()
  })

  it("Breadcrumb renders links, current page and separator", () => {
    const { container } = render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#">Workspace</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Sections</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
    expect(container.querySelector('[data-slot="breadcrumb"]')).toBeTruthy()
    expect(
      container.querySelector('[data-slot="breadcrumb-separator"]')
    ).toBeTruthy()
    const current = container.querySelector('[data-slot="breadcrumb-page"]')
    expect(current?.getAttribute("aria-current")).toBe("page")
    expect(screen.getByText("Workspace")).toBeTruthy()
  })

  it("StepIndicator reflects step state on marker and title", () => {
    const { container } = render(
      <StepIndicator>
        <StepItem state="complete">
          <StepIndicatorMarker state="complete" index={0} />
          <StepTitle state="complete">가져오기</StepTitle>
        </StepItem>
        <StepItem state="current">
          <StepIndicatorMarker state="current" index={1} />
          <StepTitle state="current">분석</StepTitle>
        </StepItem>
      </StepIndicator>
    )
    const markers = container.querySelectorAll('[data-slot="step-marker"]')
    expect(markers).toHaveLength(2)
    expect(markers[0].getAttribute("data-state")).toBe("complete")
    expect(markers[1].getAttribute("data-state")).toBe("current")
    // completed marker shows a check icon rather than its number
    expect(markers[0].querySelector("svg")).toBeTruthy()
    expect(markers[1].textContent).toContain("2")
    expect(screen.getByText("분석")).toBeTruthy()
  })

  it("InPageNav marks the active link with indicator and aria-current", () => {
    const { container } = render(
      <InPageNav>
        <InPageNavList>
          <InPageNavItem>
            <InPageNavLink href="#a" active>
              역할과 화성
            </InPageNavLink>
          </InPageNavItem>
          <InPageNavItem>
            <InPageNavLink href="#b">전조 / 단순화</InPageNavLink>
          </InPageNavItem>
        </InPageNavList>
      </InPageNav>
    )
    const links = container.querySelectorAll('[data-slot="in-page-nav-link"]')
    expect(links).toHaveLength(2)
    expect(links[0].getAttribute("data-active")).toBe("true")
    expect(links[0].getAttribute("aria-current")).toBe("location")
    expect(links[1].getAttribute("data-active")).toBe("false")
    expect(links[1].getAttribute("aria-current")).toBeNull()
    // indicator + gap pair present on the link
    expect(links[0].className).toContain("border-l-2")
    expect(links[0].className).toContain("pl-3")
  })

  it("Toaster shows a fired toast message", async () => {
    render(<Toaster />)
    expect(typeof toast).toBe("function")
    toast("분석 준비 완료")
    expect(await screen.findByText("분석 준비 완료")).toBeTruthy()
  })
})

describe("Slider component", () => {
  it("Slider mounts with track, indicator and thumb", () => {
    const { container } = render(<Slider defaultValue={50} aria-label="vol" />)
    expect(container.querySelector('[data-slot="slider"]')).toBeTruthy()
    expect(container.querySelector('[data-slot="slider-track"]')).toBeTruthy()
    expect(container.querySelector('[data-slot="slider-indicator"]')).toBeTruthy()
    expect(container.querySelector('[data-slot="slider-thumb"]')).toBeTruthy()
  })
})
