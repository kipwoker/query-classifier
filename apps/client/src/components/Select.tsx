import { useEffect, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  // Optional hover tooltip for long labels (e.g. the schema JSON shown for
  // example queries).
  title?: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  // Shown (dimmed) on the closed trigger when value is "".
  placeholder?: string;
  // Which edge of the trigger the menu aligns to - "right" keeps long menus
  // inside the right-hand settings panel instead of overflowing the screen.
  align?: "left" | "right";
  ariaLabel?: string;
}

// The native <select> popup is rendered by the OS and cannot be themed (its
// options always show up white), so this component renders the whole dropdown:
// a styled trigger button plus a dark menu that scrolls with the site-wide
// themed scrollbar. Keyboard support: arrows/Enter navigate and pick, Escape
// closes, Tab and outside clicks dismiss.
export function Select({ value, options, onChange, placeholder, align = "left", ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value);

  // Close on any click outside the component.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // On open: highlight the selected option and focus the menu so arrows work
  // immediately. options/value don't change while open, so [open] suffices.
  useEffect(() => {
    if (!open) return;
    setHighlighted(Math.max(0, options.findIndex((o) => o.value === value)));
    menuRef.current?.focus();
  }, [open, options, value]);

  // Keep the highlighted row visible inside the scrolling menu.
  useEffect(() => {
    if (!open) return;
    const rows = menuRef.current?.querySelectorAll<HTMLElement>(".select-option");
    rows?.[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  function choose(option: SelectOption) {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(options.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = options[highlighted];
      if (option) choose(option);
    } else if (e.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div className={`select${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={selected ? "select-label" : "select-label placeholder"} title={selected?.title}>
          {selected?.label ?? placeholder ?? "\u00a0"}
        </span>
        <svg className="select-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2.5 4.5 L6 8 L9.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          className={`select-menu align-${align}`}
          role="listbox"
          ref={menuRef}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
        >
          {options.map((option, i) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={`select-option${i === highlighted ? " highlighted" : ""}${option.value === value ? " selected" : ""}`}
              title={option.title}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => choose(option)}
            >
              {option.label}
            </button>
          ))}
          {options.length === 0 && <div className="select-empty">No options</div>}
        </div>
      )}
    </div>
  );
}
