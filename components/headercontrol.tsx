"use client"

import { Minus, Square, X, Maximize2, Expand, SquaresExclude, Copy } from "lucide-react"
import { useState, useEffect, type ReactNode } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { platform } from "@tauri-apps/plugin-os"
import Sidebar from "./sidebar"

interface LayoutProps {
  children: ReactNode
}

type OSType = "macos" | "windows" | "linux"

const Header = ({ children }: LayoutProps) => {
  const [appTitle, setAppTitle] = useState("Auracraft")
  const [os, setOs] = useState<OSType | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const initializeHeader = async () => {
      const osPlatform = await platform()
      setOs(osPlatform as OSType)

      // Fetch window title and maximize state
      const appWindow = getCurrentWindow()
      const title = await appWindow.title()
      setAppTitle(title)
      const maximized = await appWindow.isMaximized()
      setIsMaximized(maximized)
    }
    initializeHeader()
  }, [])

  const handleMinimize = async () => {
    await getCurrentWindow().minimize()
  }

  const handleMaximize = async () => {
    const appWindow = getCurrentWindow()
    const isMax = await appWindow.isMaximized()

    if (isMax) {
      await appWindow.unmaximize()
      setIsMaximized(false)
    } else {
      await appWindow.maximize()
      setIsMaximized(true)
    }
  }

  const handleClose = async () => {
    await getCurrentWindow().close()
  }

  const handleMouseDown = async (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
    if (e.button === 0) {
      const target = e.target as HTMLElement
      if (!target.closest(".control-buttons")) {
        const appWindow = getCurrentWindow()
        await appWindow.startDragging()
      }
    }
  }

  

  const WindowsTitleBar = () => (
    <div
      className="fixed top-0 left-0 right-0 h-8  flex items-center justify-between pl-2"
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-center space-x-2">
        {/* <div className="w-4 h-4 bg-primary rounded-sm flex items-center justify-center">
          <div className="w-2 h-2 bg-primary-foreground rounded-sm"></div>
        </div>
        <span className="text-xs text-foreground select-none">{appTitle}</span> */}
      </div>
      <div className="flex items-center control-buttons">
        <button
          onClick={handleMinimize}
          className="w-12 h-8 hover:bg-muted flex items-center justify-center group transition-colors"
        >
          <Minus className="w-3 h-3 text-foreground" strokeWidth={1.5} />
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-8 hover:bg-muted flex items-center justify-center group transition-colors"
        >
          {isMaximized ? (
            <Copy className="w-3 h-3 text-foreground scale-x-[-1]" strokeWidth={1.5} />
          ) : (
            <Square className="w-3 h-3 text-foreground" strokeWidth={1.5} />
          )}
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-8 hover:bg-destructive flex items-center justify-center group transition-colors"
        >
          <X className="w-4 h-4 text-foreground group-hover:text-destructive-foreground" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )

  const MacOSTitleBar = () => (
    <div
      className="w-full h-11 bg-muted border-b border-border flex items-center justify-between px-3"
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-center space-x-2 control-buttons">
        <button
          onClick={handleClose}
          className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center group"
        >
          <X className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" strokeWidth={2} />
        </button>
        <button
          onClick={handleMinimize}
          className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 flex items-center justify-center group"
        >
          <Minus className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" strokeWidth={2.5} />
        </button>
        <button
          onClick={handleMaximize}
          className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center group"
        >
          <Maximize2 className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" strokeWidth={2} />
        </button>
      </div>
      <div className="absolute left-1/2 transform -translate-x-1/2">
        <span className="text-xs text-foreground font-medium select-none">{appTitle}</span>
      </div>
      <div className="w-16"></div>
    </div>
  )

  const LinuxTitleBar = () => (
    <div
      className="w-full h-9 bg-secondary border-b border-border flex items-center justify-between px-3 shadow-sm"
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-center space-x-2">
        <div className="w-4 h-4 bg-primary rounded-sm flex items-center justify-center shadow-inner">
          <div className="w-2 h-2 bg-primary-foreground rounded-sm"></div>
        </div>
        <span className="text-xs text-secondary-foreground font-normal select-none">{appTitle}</span>
      </div>
      <div className="flex items-center space-x-1 control-buttons">
        <button
          onClick={handleMinimize}
          className="w-8 h-7 hover:bg-muted rounded flex items-center justify-center transition-colors"
        >
          <Minus className="w-3.5 h-3.5 text-secondary-foreground" strokeWidth={2} />
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-7 hover:bg-muted rounded flex items-center justify-center transition-colors"
        >
          {isMaximized ? (
            <svg
              className="w-3.5 h-3.5 text-secondary-foreground"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="2" y="2" width="7" height="7" />
              <path d="M3 3 V1 H11 V9 H9" />
            </svg>
          ) : (
            <Square className="w-3.5 h-3.5 text-secondary-foreground" strokeWidth={2} />
          )}
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-7 hover:bg-destructive rounded flex items-center justify-center transition-colors group"
        >
          <X className="w-4 h-4 text-secondary-foreground group-hover:text-destructive-foreground" strokeWidth={2} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      {os === "windows" && <WindowsTitleBar />}
      {os === "macos" && <MacOSTitleBar />}
      {os === "linux" && <LinuxTitleBar />}
      <Sidebar>
        <main className={`flex-1 overflow-hidden mt-2`}>{children}</main>
      </Sidebar>
    </div>
  )
}

export default Header
