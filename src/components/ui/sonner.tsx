"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-data-[type=error]:bg-destructive group-data-[type=error]:text-destructive-foreground group-data-[type=success]:bg-emerald-500 group-data-[type=success]:text-white group-data-[type=info]:bg-blue-500 group-data-[type=info]:text-white group-data-[type=warning]:bg-yellow-500 group-data-[type=warning]:text-white border-border bg-card text-foreground shadow-lg rounded-xl",
          description: "group-data-[muted]:text-muted-foreground",
          actionButton:
            "group-data-[primary]:bg-primary group-data-[primary]:text-primary-foreground",
          cancelButton:
            "group-data-[muted]:bg-muted group-data-[muted]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
