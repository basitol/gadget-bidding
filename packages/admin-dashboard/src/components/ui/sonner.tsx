"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckIcon, InfoIcon, TriangleAlertIcon, XIcon, Loader2Icon } from "lucide-react"

/** Toast design: white card, soft shadow, icon on a pale round badge, dark medium text. */
const badge = (bg: string, fg: string, icon: React.ReactNode) => (
  <span
    className="flex size-8 shrink-0 items-center justify-center rounded-full"
    style={{ background: bg, color: fg }}
  >
    {icon}
  </span>
)

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: badge("#E7F6EC", "#15803D", <CheckIcon className="size-4" strokeWidth={2.2} />),
        info: badge("#EEF2FF", "#3E6AF0", <InfoIcon className="size-4" strokeWidth={2.2} />),
        warning: badge("#FFF1E2", "#C2410C", <TriangleAlertIcon className="size-4" strokeWidth={2.2} />),
        error: badge("#FDECEC", "#E5484D", <XIcon className="size-4" strokeWidth={2.2} />),
        loading: badge("#EEF2FF", "#3E6AF0", <Loader2Icon className="size-4 animate-spin" />),
      }}
      style={
        {
          "--normal-bg": "#FFFFFF",
          "--normal-text": "#1C1F2A",
          "--normal-border": "rgba(255,255,255,0.9)",
          "--border-radius": "18px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast !gap-3 !rounded-[18px] !py-3 !pl-3 !pr-5 !shadow-[0_8px_24px_rgba(20,28,60,0.10)] !text-[15px] !font-medium",
          icon: "!m-0 !size-8 !flex !items-center !justify-center",
          title: "!text-[15px] !font-medium !text-[#1C1F2A]",
          description: "!text-[13px] !text-[#7C8293]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
