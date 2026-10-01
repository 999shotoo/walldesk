"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

function TabsList({
  className,
  ...props
}: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-max items-center justify-center gap-1 rounded-lg p-1",
        className
      )}
      {...props}
    />
  )
}

function TabsTab({
  className,
  ...props
}: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "ring-offset-background focus-visible:ring-ring data-[active]:bg-primary data-[active]:text-primary-foreground data-[active]:scale-[1.015] cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 [&+[data-slot=tabs-tab]]:ml-1 data-[active]:shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function TabsPanel({
  className,
  ...props
}: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("mt-4 outline-none", className)}
      {...props}
    />
  )
}

function TabsIndicator({
  className,
  ...props
}: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      className={cn("bg-background shadow-sm rounded-md", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTab, TabsPanel, TabsIndicator }
