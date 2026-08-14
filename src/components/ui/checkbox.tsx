"use client"

import * as React from "react"
import { Check, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "checked" | "onChange"> {
  checked?: boolean | "indeterminate"
  indeterminate?: boolean
  onCheckedChange?: (checked: boolean) => void
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, indeterminate, onCheckedChange, onChange, disabled, ...props }, ref) => {
    const defaultRef = React.useRef<HTMLInputElement>(null)
    const combinedRef = (ref as React.RefObject<HTMLInputElement>) || defaultRef

    const isChecked = checked === true
    const isIndeterminate = checked === "indeterminate" || !!indeterminate

    React.useEffect(() => {
      if (combinedRef.current) {
        combinedRef.current.indeterminate = isIndeterminate
      }
    }, [isIndeterminate, combinedRef])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e)
      onCheckedChange?.(e.target.checked)
    }

    return (
      <div className="relative inline-flex items-center justify-center shrink-0">
        <input
          type="checkbox"
          ref={combinedRef}
          checked={isChecked}
          disabled={disabled}
          onChange={handleChange}
          className={cn(
            "peer size-4 shrink-0 cursor-pointer appearance-none rounded border border-border/80 bg-background transition-colors",
            "hover:border-primary/80 hover:bg-muted/30",
            "checked:border-primary checked:bg-primary",
            "indeterminate:border-primary indeterminate:bg-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:opacity-40",
            className
          )}
          {...props}
        />
        <Check className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 peer-checked:opacity-100 transition-opacity" />
        <Minus className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 peer-indeterminate:opacity-100 transition-opacity" />
      </div>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
