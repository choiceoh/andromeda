import { type CSSProperties, useState } from "react";

// A one-line "type → Enter/button → submit, then clear" input — the quick-add (할일)
// and inline answer (작업피드) rows. Owns the field value + the trim/clear/Enter
// wiring (the bug-prone part); presentation stays prop-driven since the two sites
// differ only in styling (accent button vs chip, sizing).
export function InputRow({
  placeholder,
  onSubmit,
  buttonLabel,
  disabled = false,
  buttonClassName = "btn btn-accent",
  style,
  inputStyle,
  buttonStyle,
}: {
  placeholder?: string;
  onSubmit: (value: string) => void;
  buttonLabel: string;
  disabled?: boolean;
  buttonClassName?: string;
  style?: CSSProperties;
  inputStyle?: CSSProperties;
  buttonStyle?: CSSProperties;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const v = value.trim();
    if (!v || disabled) return;
    setValue("");
    onSubmit(v);
  }

  return (
    <div style={{ display: "flex", gap: 6, ...style }}>
      <input
        className="field"
        style={{ flex: 1, ...inputStyle }}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <button className={buttonClassName} onClick={submit} disabled={disabled || !value.trim()} style={buttonStyle}>
        {buttonLabel}
      </button>
    </div>
  );
}
